// @ts-check

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { createObjectCsvWriter } from "csv-writer";
import { compareImageNames, getColumnRect, getLayoutForPage, getPageNumber, csvHeader } from "./common.js";

/** @type {ReadonlySet<string>} */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"]);

/**
 * CSV出力用レコード
 * @typedef {Object.<string, string | number>} TimetableRecord
 */

/**
 * OCR対象フィールド定義
 * @typedef {Object} LayoutField
 * @property {string} key 出力項目名
 * @property {number} y 列画像内のY座標
 * @property {number} height 切り出し高さ
 */

/**
 * テーブル矩形定義
 * @typedef {Object} TableRect
 * @property {number} left 左端X座標
 * @property {number} top 上端Y座標
 * @property {number} right 右端X座標
 * @property {number} bottom 下端Y座標
 */

/**
 * ページ解析用レイアウト定義
 * @typedef {Object} PageLayout
 * @property {string} name レイアウト名
 * @property {number} columns 列数
 * @property {number} rowMargin 項目切り出し時の上下余白
 * @property {string} operatingDay 運行日区分
 * @property {string} revisionDate 改正日
 * @property {TableRect} tableRect テーブル領域
 * @property {LayoutField[]} fields OCR対象フィールド一覧
 */

/**
 * 画像ディレクトリ内の時刻表画像をOCR解析する
 * @param {string} imageDir 画像ファイルが格納されているディレクトリ
 * @returns {Promise<TimetableRecord[]>} OCR解析結果
 */
export async function parseImageTimetable(imageDir) {
	const imageFiles = await getImageFiles(imageDir);
	if (imageFiles.length === 0) {
		throw new Error(`画像ファイルが見つかりません: ${imageDir}`);
	}

	console.log(`解析対象画像数: ${imageFiles.length}件`);

	const worker = await createWorker({
		logger: (m) => {
			// OCRの進捗ログが多すぎる場合は、この console.log をコメントアウトする
			if (m.status === "recognizing text") {
				// console.log(`[OCR] ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
			}
		},
	});

	await worker.load();
	await worker.loadLanguage("jpn");
	await worker.initialize("jpn");

	/**
	 * @type {TimetableRecord[]}
	 */
	const records = [];

	try {
		for (const [index, fileName] of imageFiles.entries()) {
			const fileIndex = index + 1;

			// ファイル名からページ番号が取れない場合は、並び順をページ番号として扱う
			const pageNumber = getPageNumber(fileName) || fileIndex;
			const layout = getLayoutForPage(pageNumber);

			if (!layout) {
				console.warn(`[${fileIndex}/${imageFiles.length}] ページ ${pageNumber} のレイアウトが見つかりません。スキップします: ${fileName}`);
				continue;
			}

			console.log("");
			console.log(`[${fileIndex}/${imageFiles.length}] 解析開始: ${fileName}`);
			console.log(`ページ番号: ${pageNumber}`);
			console.log(`レイアウト: ${layout.name}ページレイアウト`);
			console.log(`列数: ${layout.columns}`);

			const pageRecords = await parsePageImage(fileName, imageDir, pageNumber, layout, worker, fileIndex, imageFiles.length);
			records.push(...pageRecords);

			console.log(`[${fileIndex}/${imageFiles.length}] 解析完了: ${fileName} / 出力レコード数: ${pageRecords.length}`);
		}
	} finally {
		// OCRワーカーは重いリソースなので、途中でエラーになっても必ず終了する
		await worker.terminate();
	}

	return records;
}

/**
 * OCR解析結果をCSVファイルへ出力する
 * @param {TimetableRecord[]} records CSV出力用レコード一覧
 * @param {string} outputPath CSV出力先パス
 * @returns {Promise<void>} 処理完了
 */
export async function writeCsv(records, outputPath) {
	const csvWriter = createObjectCsvWriter({
		path: outputPath,
		header: csvHeader,
	});
	await csvWriter.writeRecords(records);
}

/**
 * 指定ディレクトリ内の画像ファイル名一覧を取得する
 * @param {string} imageDir 画像ファイルが格納されているディレクトリ
 * @returns {Promise<string[]>} ページ番号順に並べた画像ファイル名一覧
 */
async function getImageFiles(imageDir) {
	const entries = await fs.readdir(imageDir, { withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
		.sort((a, b) => compareImageNames(a.name, b.name))
		.map((entry) => entry.name);
}

/**
 * ページ画像を列・項目ごとに切り出してOCR解析する
 * @param {string} fileName 画像ファイル名
 * @param {string} imageDir 画像ファイルが格納されているディレクトリ
 * @param {number} pageNumber ページ番号
 * @param {PageLayout} layout ページ解析用レイアウト定義
 * @param {import("tesseract.js").Worker} worker OCR解析用ワーカー
 * @param {number} fileIndex 現在のファイル番号
 * @param {number} fileCount 全体のファイル数
 * @returns {Promise<TimetableRecord[]>} ページ内のOCR解析結果
 */
async function parsePageImage(fileName, imageDir, pageNumber, layout, worker, fileIndex, fileCount) {
	const filePath = path.join(imageDir, fileName);
	const image = sharp(filePath);
	const metadata = await image.metadata();

	/** @type {TimetableRecord[]} */
	const pageRecords = [];

	for (let columnIndex = 0; columnIndex < layout.columns; columnIndex += 1) {
		const columnNumber = columnIndex + 1;
		const rect = getColumnRect(layout, columnIndex);

		console.log(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} を解析中`);

		if (rect.left + rect.width > metadata.width) {
			console.warn(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} の幅が画像範囲を超えています。調整が必要です。`);
			continue;
		}

		// sharp は加工パイプラインを持つため、同じ画像から複数回切り出す場合は clone() して処理を分離する
		const columnBuffer = await image.clone().extract(rect).png().toBuffer();
		const columnImage = sharp(columnBuffer);
		const columnMetadata = await columnImage.metadata();

		if (columnIndex === 0) {
			console.log(`[DEBUG] rect: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
			console.log(`[DEBUG] columnMetadata: width=${columnMetadata.width}, height=${columnMetadata.height}`);
		}

		/** @type {TimetableRecord} */
		const record = {
			運行日区分: layout.operatingDay,
			改正日: layout.revisionDate,
			ページ番号: pageNumber,
		};

		for (const field of layout.fields) {
			// OCR対象の文字が少し上下にずれても拾えるように、定義された高さへ余白を追加して切り出す
			const cropTop = Math.max(0, field.y - layout.rowMargin);
			const cropHeight = Math.min(field.height + layout.rowMargin * 2, columnMetadata.height - cropTop);

			if (columnIndex === 0) {
				console.log(`[DEBUG] field=${field.key}, y=${field.y}, cropTop=${cropTop}, cropHeight=${cropHeight}, columnHeight=${columnMetadata.height}`);
			}

			if (cropTop < 0 || cropHeight <= 0 || columnMetadata.width <= 0) {
				console.warn(
					`[${fileIndex}/${fileCount}] ${fileName} - フィールド ${field.key} (列${columnNumber}/${layout.columns}) の切り出し領域が不正です: cropTop=${cropTop}, cropHeight=${cropHeight}, width=${columnMetadata.width}, columnHeight=${columnMetadata.height}`,
				);
				record[field.key] = "";
				continue;
			}

			try {
				// 列画像からフィールド単位で再切り出しして、OCRに渡す画像を小さくする
				const fieldBuffer = await columnImage
					.clone()
					.extract({
						left: 0,
						top: cropTop,
						width: columnMetadata.width,
						height: cropHeight,
					})
					.png()
					.toBuffer();

				const rawText = await recognizeText(worker, fieldBuffer);
				record[field.key] = normalizeField(field.key, rawText);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				console.error(`[${fileIndex}/${fileCount}] ${fileName} - フィールド ${field.key} (列${columnNumber}/${layout.columns}) の処理中にエラー: ${message}`);
				console.error(`  cropTop=${cropTop}, cropHeight=${cropHeight}, width=${rect.width}, columnBuffer size=${columnBuffer.length}`);

				record[field.key] = "";
			}
		}

		pageRecords.push(record);
	}

	return pageRecords;
}

/**
 * 画像バッファから文字列をOCR解析する
 * @param {import("tesseract.js").Worker} worker OCR解析用ワーカー
 * @param {Buffer} imageBuffer OCR対象画像バッファ
 * @returns {Promise<string>} OCR解析結果文字列
 */
async function recognizeText(worker, imageBuffer) {
	const { data } = await worker.recognize(imageBuffer);
	return (data.text || "").trim();
}

/**
 * OCR結果を項目ごとの形式に正規化する
 * @param {string} key 出力項目名
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の文字列
 */
function normalizeField(key, text) {
	const normalized = text
		.replace(/[\r\n]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (["名鉄名古屋 着", "名鉄名古屋 発", "金山 着", "金山 発", "鳴海 着", "鳴海 発", "有松 着"].includes(key)) {
		return normalizeTime(normalized);
	}
	if (key === "列車番号") {
		return text;
	}
	return normalized;
}

/**
 * OCR結果の時刻文字列をHHmm形式に正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} HHmm形式の時刻文字列
 */
function normalizeTime(text) {
	const match = text.match(/([0-2]?[0-9])\D?([0-5][0-9])/);
	if (!match) {
		return text;
	}
	const hh = match[1].padStart(2, "0");
	const mm = match[2];
	return `${hh}${mm}`;
}
