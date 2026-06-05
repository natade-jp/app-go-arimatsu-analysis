// @ts-check

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { blankHorizontalBorders, blankMarginAreas, getColumnRect, getLayoutForPage, getPageNumber } from "./common.js";

async function main() {
	const [csvPath, outputPathArg] = process.argv.slice(2);
	if (!csvPath) {
		console.error("使い方: node src/concatColumns.js <csv-file> [output.png]");
		process.exit(1);
	}

	const outputPath = outputPathArg || path.join(process.cwd(), `${path.basename(csvPath, path.extname(csvPath))}-concat.png`);

	const rows = await readCsvRows(csvPath);
	if (rows.length === 0) {
		console.error(`CSVに処理対象がありません: ${csvPath}`);
		process.exit(1);
	}

	const columnStrips = [];

	for (const [rowIndex, { imagePath, columnIndex }] of rows.entries()) {
		const absoluteImagePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
		console.log(`(${rowIndex + 1}/${rows.length}) ${absoluteImagePath} 列 ${columnIndex} を処理中...`);

		const pageNumber = getPageNumber(path.basename(absoluteImagePath));
		if (!pageNumber) {
			console.error(`ファイル名からページ番号を取得できませんでした: ${absoluteImagePath}`);
			process.exit(1);
		}

		const layout = getLayoutForPage(pageNumber);
		if (!layout) {
			console.error(`ページ ${pageNumber} のレイアウトが定義されていません。src/tableConfig.js を確認してください。`);
			process.exit(1);
		}

		if (columnIndex < 0 || columnIndex >= layout.columns) {
			console.error(`列番号 ${columnIndex} は範囲外です。0〜${layout.columns - 1} を指定してください。`);
			process.exit(1);
		}

		const stripBuffer = await buildVerticalColumnStrip(absoluteImagePath, layout, columnIndex);
		columnStrips.push(stripBuffer);
	}

	if (columnStrips.length === 0) {
		console.error("処理できる列画像がありませんでした。");
		process.exit(1);
	}

	await buildHorizontalComposite(columnStrips, outputPath);
	console.log(`出力完了: ${outputPath}`);
}

/**
 * CSVファイルから画像パスと列番号の行を読み取る
 * @param {string} csvPath
 * @returns {Promise<Array<{imagePath:string,columnIndex:number}>>}
 */
async function readCsvRows(csvPath) {
	const source = await fs.readFile(csvPath, "utf8");
	return source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.map((line, index) => {
			const parts = line.split(",").map((part) => part.trim());
			if (parts.length < 2) {
				throw new Error(`CSVの${index + 1}行目が不正です。image.png,列番号 の形式にしてください: ${line}`);
			}
			const imagePath = parts[0];
			const columnIndex = Number(parts[1]);
			if (!imagePath) {
				throw new Error(`CSVの${index + 1}行目に画像パスがありません: ${line}`);
			}
			if (Number.isNaN(columnIndex) || !Number.isInteger(columnIndex) || columnIndex < 0) {
				throw new Error(`CSVの${index + 1}行目の列番号が不正です: ${parts[1]}`);
			}
			return { imagePath, columnIndex };
		});
}

/**
 * 指定列をフィールド単位で切り出し、縦に結合した列画像を生成する
 * @param {string} imagePath
 * @param {import("./common.js").PageLayout} layout
 * @param {number} columnIndex
 * @returns {Promise<Buffer>}
 */
async function buildVerticalColumnStrip(imagePath, layout, columnIndex) {
	const image = sharp(imagePath);
	const metadata = await image.metadata();

	const rect = getColumnRect(layout, columnIndex);
	if (metadata.width === undefined || metadata.height === undefined) {
		throw new Error(`画像メタデータが取得できませんでした: ${imagePath}`);
	}

	if (rect.left + rect.width > metadata.width || rect.top + rect.height > metadata.height) {
		throw new Error(`切り出し領域が画像の範囲外です: ${imagePath} / ${JSON.stringify(rect)}`);
	}

	const columnBuffer = await image.clone().extract(rect).png().toBuffer();
	let columnImage = sharp(columnBuffer);
	const columnMetadata = await columnImage.metadata();
	if (columnMetadata.width === undefined || columnMetadata.height === undefined) {
		throw new Error(`列画像のメタデータが取得できませんでした: ${imagePath}`);
	}

	if (layout.horizontalMargin > 0) {
		const maskedColumnBuffer = await blankHorizontalBorders(columnBuffer, columnMetadata.width, columnMetadata.height, layout.horizontalMargin);
		columnImage = sharp(maskedColumnBuffer);
	}

	const fieldImages = [];
	let totalHeight = 0;

	for (const field of layout.fields) {
		const cropTop = Math.max(0, field.y - layout.rowMargin);
		const cropHeight = Math.min(field.height + layout.rowMargin * 2, columnMetadata.height - cropTop);

		if (cropHeight <= 0) {
			throw new Error(`フィールド切り出しに失敗しました: ${field.key} y=${field.y} height=${field.height}`);
		}

		let fieldBuffer = await columnImage.clone().extract({ left: 0, top: cropTop, width: columnMetadata.width, height: cropHeight }).png().toBuffer();
		const topMarginPixels = field.y - cropTop;
		const bottomMarginPixels = cropHeight - field.height - topMarginPixels;
		if (topMarginPixels > 0 || bottomMarginPixels > 0) {
			fieldBuffer = await blankMarginAreas(fieldBuffer, columnMetadata.width, cropHeight, {
				top: topMarginPixels,
				bottom: bottomMarginPixels,
			});
		}

		fieldImages.push({ buffer: fieldBuffer, top: totalHeight });
		totalHeight += cropHeight;
	}

	const compositeImage = sharp({
		create: {
			width: columnMetadata.width,
			height: totalHeight,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 0 },
		},
	}).composite(fieldImages.map((item) => ({ input: item.buffer, top: item.top, left: 0 })));

	return compositeImage.png().toBuffer();
}

/**
 * 生成した縦長画像を横に連結して最終画像を作る
 * @param {Buffer[]} images
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function buildHorizontalComposite(images, outputPath) {
	const metadatas = await Promise.all(images.map((buffer) => sharp(buffer).metadata()));
	const totalWidth = metadatas.reduce((sum, meta) => sum + (meta.width ?? 0), 0);
	const maxHeight = Math.max(...metadatas.map((meta) => meta.height ?? 0));

	let left = 0;
	const composites = [];
	for (const [index, buffer] of images.entries()) {
		const width = metadatas[index].width ?? 0;
		composites.push({ input: buffer, top: 0, left });
		left += width;
	}

	await sharp({
		create: {
			width: totalWidth,
			height: maxHeight,
			channels: 4,
			background: { r: 255, g: 255, b: 255, alpha: 0 },
		},
	})
		.composite(composites)
		.png()
		.toFile(outputPath);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
