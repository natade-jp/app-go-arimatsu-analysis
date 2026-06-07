// @ts-check

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { createObjectCsvWriter } from "csv-writer";
import { blankHorizontalBorders, blankMarginAreas, compareImageNames, getColumnRect, getLayoutForPage, getPageNumber, csvHeader } from "./common.js";

/** @type {ReadonlySet<string>} */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"]);

let currentWhitelist = "";

/**
 * CSV出力用レコード
 * @typedef {Object.<string, string | number>} TimetableRecord
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
 * @param {import("./common.js").PageLayout} layout ページ解析用レイアウト定義
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

		if (metadata.width === undefined || rect.left + rect.width > metadata.width) {
			console.warn(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} の幅が画像範囲を超えています。調整が必要です。`);
			continue;
		}

		// sharp は加工パイプラインを持つため、同じ画像から複数回切り出す場合は clone() して処理を分離する
		const columnBuffer = await image.clone().extract(rect).png().toBuffer();
		let columnImage = sharp(columnBuffer);
		const columnMetadata = await columnImage.metadata();

		if (columnMetadata === undefined || columnMetadata.width === undefined || columnMetadata.height === undefined) {
			console.warn(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} の画像メタデータが取得できませんでした。スキップします。`);
			continue;
		}

		if (layout.horizontalMargin > 0) {
			const maskedColumnBuffer = await blankHorizontalBorders(columnBuffer, columnMetadata.width, columnMetadata.height, layout.horizontalMargin);
			columnImage = sharp(maskedColumnBuffer);
		}

		if (columnIndex === 0) {
			console.log(`[DEBUG] rect: left=${rect.left}, top=${rect.top}, width=${rect.width}, height=${rect.height}`);
			console.log(`[DEBUG] columnMetadata: width=${columnMetadata.width}, height=${columnMetadata.height}`);
		}

		/** @type {TimetableRecord} */
		const record = {
			運行日区分: layout.operatingDay,
			改正日: layout.revisionDate,
			ページ番号: pageNumber,
			列番号: columnNumber,
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
				let fieldBuffer = await columnImage
					.clone()
					.extract({
						left: 0,
						top: cropTop,
						width: columnMetadata.width,
						height: cropHeight,
					})
					.png()
					.toBuffer();

				const topMarginPixels = field.y - cropTop;
				const bottomMarginPixels = cropHeight - field.height - topMarginPixels;
				if (topMarginPixels > 0 || bottomMarginPixels > 0) {
					fieldBuffer = await blankMarginAreas(fieldBuffer, columnMetadata.width, cropHeight, {
						top: topMarginPixels,
						bottom: bottomMarginPixels,
					});
				}

				const rawText = await recognizeText(worker, fieldBuffer, field.whitelist);
				const normalizedText = normalizeField(field.key, rawText);

				// OCR結果のログは必要に応じて出力する。大量のフィールドがある場合は、ログをコメントアウトしても良い。
				console.log(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} - ${field.key}: "${rawText}" => "${normalizedText}"`);

				record[field.key] = normalizedText;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				console.error(`[${fileIndex}/${fileCount}] ${fileName} - フィールド ${field.key} (列${columnNumber}/${layout.columns}) の処理中にエラー: ${message}`);
				console.error(`  cropTop=${cropTop}, cropHeight=${cropHeight}, width=${rect.width}, columnBuffer size=${columnBuffer.length}`);

				record[field.key] = "";
			}
		}

		console.log(`[${fileIndex}/${fileCount}] ${fileName} - 列 ${columnNumber}/${layout.columns} の解析結果:`);
		console.table(record);

		pageRecords.push(record);
	}

	return pageRecords;
}

/**
 * 画像バッファから文字列をOCR解析する
 * @param {import("tesseract.js").Worker} worker OCR解析用ワーカー
 * @param {Buffer} imageBuffer OCR対象画像バッファ
 * @param {string | undefined} [whitelist] OCRで許可する文字セット
 * @returns {Promise<string>} OCR解析結果文字列
 */
async function recognizeText(worker, imageBuffer, whitelist) {
	const targetWhitelist = typeof whitelist === "string" && whitelist.length > 0 ? whitelist : "";
	if (targetWhitelist !== currentWhitelist) {
		await worker.setParameters({ tessedit_char_whitelist: targetWhitelist });
		currentWhitelist = targetWhitelist;
	}
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
	if (key === "列車番号") {
		return normalizeTrainNumber(text);
	}

	const normalized = text
		.replace(/[\r\n]+/g, "")
		.replace(/\s+/g, "")
		.trim();

	if (["名鉄名古屋 着", "名鉄名古屋 発", "金山 着", "金山 発", "鳴海 着", "鳴海 発", "有松 着"].includes(key)) {
		return normalizeTime(normalized);
	}

	if (key === "運行種別") {
		return normalizeTrainType(normalized);
	}

	if (key === "行先") {
		return normalizeDestination(normalized);
	}

	if (key === "備考") {
		return normalizeNotes(normalized);
	}

	return normalized;
}

/**
 * OCR結果の列車番号1行分を正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の列車番号
 */
function normalizeTrainNumberLine(text) {
	return normalizeDigits(text)
		.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
		.replace(/\s+/g, "")
		.replace(/[^0-9A-Za-z]/g, "");
}

/**
 * OCR結果の列車番号を正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の列車番号
 */
function normalizeTrainNumber(text) {
	const candidates = text
		.split(/\r?\n/)
		.map((line) => normalizeTrainNumberLine(line))
		.filter((line) => line.length > 0);

	if (candidates.length === 0) {
		return "";
	}

	return candidates[0];
}

/**
 * 運行種別補正定義
 * @typedef {Object} TrainTypeCorrection
 * @property {string} keyword OCR結果に含まれる文字列
 * @property {string} value 補正後の運行種別
 */

/**
 * @typedef {Object} ReplaceRule
 * @property {string} from 置換前の文字
 * @property {string} to 置換後の文字
 */

/**
 * 置換ルールに従って文字列を置換する
 * @param {string} text 置換対象の文字列
 * @param {ReplaceRule[]} rules 置換ルール一覧
 * @returns {string} 置換後の文字列
 */
function replaceByRules(text, rules) {
	let result = text;

	for (const rule of rules) {
		result = result.replaceAll(rule.from, rule.to);
	}

	return result;
}

/**
 * OCR結果の運行種別を正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の運行種別
 */
function normalizeTrainType(text) {
	const normalized = text.replace(/\s+/g, "");

	/** @type {TrainTypeCorrection[]} */
	const correctionList = [
		{ keyword: "快特", value: "快特" },
		{ keyword: "特急", value: "特急" },
		{ keyword: "急行", value: "急行" },
		{ keyword: "準急", value: "準急" },
		{ keyword: "快急", value: "快急" },

		{ keyword: "普通", value: "普通" },
		{ keyword: "暗通", value: "普通" },
		{ keyword: "智通", value: "普通" },
		{ keyword: "普", value: "普通" },
		{ keyword: "通", value: "普通" },

		{ keyword: "快暁", value: "快特" },

		{ keyword: "漸忠", value: "準急" },
		{ keyword: "漸会", value: "準急" },
		{ keyword: "準思", value: "準急" },
		{ keyword: "湯思", value: "準急" },

		{ keyword: "混思", value: "？急" },

		{ keyword: "脈思", value: "特急" },
		{ keyword: "特思", value: "特急" },
		{ keyword: "特怜", value: "特急" },

		{ keyword: "る術", value: "急行" },
		{ keyword: "る行", value: "急行" },
		{ keyword: "行", value: "急行" },

		{ keyword: "々ルや", value: "μS" },
		{ keyword: "7本く】", value: "μS" },
		{ keyword: "7衝こ】", value: "μS" },
		{ keyword: "ムS", value: "μS" },
		{ keyword: "S", value: "μS" },
		{ keyword: "⑧", value: "μS" },
	];

	const correction = correctionList.find((item) => normalized.includes(item.keyword));

	return correction?.value ?? normalized;
}

/**
 * OCR結果の行先を正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の行先
 */
function normalizeDestination(text) {
	const normalized = text.replace(/\s+/g, "");

	const correctionList = [
		{ keyword: "囲", value: "伊奈" },
		{ keyword: "和", value: "伊奈" },
		{ keyword: "呑", value: "伊奈" },
		{ keyword: "唐", value: "伊奈" },

		{ keyword: "健", value: "本宿" },
		{ keyword: "体", value: "本宿" },
		{ keyword: "本街", value: "本宿" },
		{ keyword: "本眼", value: "本宿" },

		{ keyword: "`神和", value: "河和" },

		{ keyword: "吉良天田", value: "吉良吉田" },
		{ keyword: "吉良木田", value: "吉良吉田" },
		{ keyword: "吉良杏田", value: "吉良吉田" },
		{ keyword: "吉良希田", value: "吉良吉田" },
		{ keyword: "吉良希田", value: "吉良吉田" },
		{ keyword: "吉良昌田", value: "吉良吉田" },
		{ keyword: "吉良昌田", value: "吉良吉田" },
		{ keyword: "吉良団", value: "吉良吉田" },
		{ keyword: "吉良田", value: "吉良吉田" },

		{ keyword: "宇d", value: "須ケロ" },
		{ keyword: "ャg", value: "須ケロ" },
		{ keyword: "ャョ", value: "須ケロ" },
		{ keyword: "彫ョ", value: "須ケロ" },
		{ keyword: "須ケグロ", value: "須ケロ" },
		{ keyword: "`須ケ口", value: "須ケロ" },

		{ keyword: "`豊橋", value: "豊橋" },
		{ keyword: "談", value: "豊橋？一宮？" },
		{ keyword: "論", value: "豊明" },
		{ keyword: "國", value: "豊明" },
		{ keyword: "o", value: "豊明" },
		{ keyword: "e", value: "豊明" },

		{ keyword: "神和", value: "河和" },
		{ keyword: "n", value: "河和" },
		{ keyword: "a", value: "河和" },

		{ keyword: "内海", value: "内海" },

		{ keyword: "ae", value: "鳴海" },

		{ keyword: "Aml", value: "太田川" },

		{ keyword: "`東岡崎", value: "東岡崎" },

		{ keyword: "家常滑", value: "常滑" },

		{ keyword: "閉", value: "金山" },

		{ keyword: "中部国隠空港", value: "中部国際空港" },
		{ keyword: "中部国際空淑", value: "中部国際空港" },
	];

	const correction = correctionList.find((item) => normalized === item.keyword);

	return correction?.value ?? normalized;
}

/**
 * OCR結果の備考を正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} 正規化後の備考
 */
function normalizeNotes(text) {
	let normalized = text.replace(/\s+/g, "");

	/** @type {ReplaceRule[]} */
	const replaceRules = [
		{ from: "ーー部特別車", to: "一部特別車" },
		{ from: "一部特別木", to: "一部特別車" },

		{ from: "新享城", to: "新安城" },

		{ from: "亨岡崎", to: "東岡崎" },

		{ from: "名号屋", to: "名古屋" },
		{ from: "名吉屋", to: "名古屋" },

		{ from: "から[", to: "から普通" },

		{ from: "景通", to: "普通" },
		{ from: "調通", to: "普通" },
		{ from: "商通", to: "普通" },
		{ from: "智通", to: "普通" },
		{ from: "暁通", to: "普通" },

		{ from: "人準急", to: "準急" },
		{ from: "雙急", to: "準急" },
		{ from: "遜急", to: "準急" },
		{ from: "塗急", to: "準急" },
		{ from: "琶急", to: "準急" },
		{ from: "塔急", to: "準急" },
	];
	normalized = replaceByRules(normalized, replaceRules);

	const correctionList = [
		{ keyword: "閻", value: "" },
		{ keyword: "國", value: "" },
	];

	const correction = correctionList.find((item) => normalized === item.keyword);

	return correction?.value ?? normalized;
}

/**
 * 丸数字・全角数字を通常の半角数字へ変換する
 * @param {string} text 変換対象文字列
 * @returns {string} 変換後文字列
 */
function normalizeDigits(text) {
	return text
		.replace(/⑳/g, "20")
		.replace(/⑲/g, "19")
		.replace(/⑱/g, "18")
		.replace(/⑰/g, "17")
		.replace(/⑯/g, "16")
		.replace(/⑮/g, "15")
		.replace(/⑭/g, "14")
		.replace(/⑬/g, "13")
		.replace(/⑫/g, "12")
		.replace(/⑪/g, "11")
		.replace(/⑩/g, "10")
		.replace(/[⓪０]/g, "0")
		.replace(/[①１]/g, "1")
		.replace(/[②２]/g, "2")
		.replace(/[③３]/g, "3")
		.replace(/[④４]/g, "4")
		.replace(/[⑤５]/g, "5")
		.replace(/[⑥６]/g, "6")
		.replace(/[⑦７]/g, "7")
		.replace(/[⑧８]/g, "8")
		.replace(/[⑨９]/g, "9");
}

/**
 * 指定文字数の同じ2回繰り返しを1回にまとめる
 * @param {string} text 変換対象文字列
 * @param {number[]} lengths 対象にする文字数
 * @returns {string} 変換後文字列
 */
function collapseRepeatedText(text, lengths) {
	for (const length of lengths) {
		if (text.length !== length * 2) {
			continue;
		}

		const first = text.slice(0, length);
		const second = text.slice(length);

		if (first === second) {
			return first;
		}
	}

	return text;
}

/**
 * OCR結果の時刻文字列をHHmm形式に正規化する
 * @param {string} text OCR結果文字列
 * @returns {string} HHmm形式の時刻文字列
 */
function normalizeTime(text) {
	text = collapseRepeatedText(text, [3, 4]);

	// 時刻文字列に「レ」が含まれている場合は止まらないため「0」とみなす
	if (/レ/.test(text)) {
		return "0";
	}

	const digitText = normalizeDigits(text).replace(/[^0-9]/g, "");

	// 数字が全くない場合はOCRミスなので「0」とみなす
	if (digitText.length === 0) {
		return "0";
	}

	// 例: 536 → 0536
	if (/^[0-9]{3}$/.test(digitText)) {
		return `0${digitText}`;
	}

	// 例: 1536 → 1536
	if (/^[0-9]{4}$/.test(digitText)) {
		return digitText;
	}

	return text;
}
