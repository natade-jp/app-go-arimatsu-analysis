import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { pageLayouts } from "./tableConfig.js";

function getPageNumber(fileName) {
	const match = fileName.match(/(\d+)/);
	return match ? Number(match[1]) : null;
}

function getLayoutForPage(pageNumber) {
	return pageLayouts[pageNumber % 2 === 1 ? "odd" : "even"];
}

function getColumnRect(layout, columnIndex) {
	const left = layout.tableRect.left;
	const top = layout.tableRect.top;
	const tableWidth = layout.tableRect.right - layout.tableRect.left;
	const columnWidths = layout.columnWidths || Array(layout.columns).fill(Math.floor(tableWidth / layout.columns));
	const width = columnWidths[columnIndex] || 0;
	const offsetLeft = left + columnWidths.slice(0, columnIndex).reduce((sum, w) => sum + w, 0);
	return {
		left: offsetLeft,
		top,
		width,
		height: layout.tableRect.bottom - layout.tableRect.top,
	};
}

async function main() {
	const [imagePath, columnArg, outputPathArg] = process.argv.slice(2);
	if (!imagePath || columnArg == null) {
		console.error("使い方: node src/extractColumn.js data/images/page-01.png 0 [output.png]");
		process.exit(1);
	}

	const columnIndex = Number(columnArg);
	if (Number.isNaN(columnIndex) || columnIndex < 0) {
		console.error("列番号は0から始まる整数を指定してください。");
		process.exit(1);
	}

	const pageNumber = getPageNumber(path.basename(imagePath));
	if (!pageNumber) {
		console.error("ファイル名からページ番号を取得できませんでした。例: page-01.png");
		process.exit(1);
	}

	const layout = getLayoutForPage(pageNumber);
	if (!layout) {
		console.error(`ページ ${pageNumber} のレイアウトが定義されていません。src/tableConfig.js を確認してください。`);
		process.exit(1);
	}

	if (columnIndex >= layout.columns) {
		console.error(`列番号が範囲外です。0〜${layout.columns - 1} の範囲で指定してください。`);
		process.exit(1);
	}

	const outputPath = outputPathArg || path.join(path.dirname(imagePath), `${path.basename(imagePath, path.extname(imagePath))}-column-${columnIndex}${path.extname(imagePath)}`);

	try {
		const image = sharp(imagePath);
		const metadata = await image.metadata();
		const rect = getColumnRect(layout, columnIndex);

		if (rect.left + rect.width > metadata.width || rect.top + rect.height > metadata.height) {
			console.error("指定した領域が画像の範囲外です。src/tableConfig.js の tableRect または columns の設定を確認してください。");
			console.error(`画像サイズ: ${metadata.width}x${metadata.height}`);
			console.error(`切り出し領域: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
			process.exit(1);
		}

		await image.extract(rect).toFile(outputPath);

		console.log(`ページ ${pageNumber} (${pageNumber % 2 === 1 ? "odd" : "even"}) の列 ${columnIndex} を切り出しました。`);
		console.log(`出力: ${outputPath}`);
		console.log(`切り出し領域: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
	} catch (error) {
		console.error("画像の切り出しに失敗しました:", error.message);
		process.exit(1);
	}
}

main();
