import fs from "fs/promises";
import pdf from "pdf-parse";
import { createObjectCsvWriter } from "csv-writer";
import { csvHeader } from "./common.js";

export async function parsePdfTimetable(pdfPath) {
	const fileBuffer = await fs.readFile(pdfPath);
	const data = await pdf(fileBuffer);
	const text = data.text || "";

	// PDFからテキスト抽出するための補助関数です。
	// 名鉄の時刻表PDFはレイアウトが特殊なため、直接OCRで処理する場合は
	// 画像として書き出してから `src/imageTableOcr.js` を使うことを推奨します。
	console.log("抽出テキストの先頭:\n", text.slice(0, 1000));

	return [];
}

export async function writeCsv(records, outputPath) {
	const csvWriter = createObjectCsvWriter({
		path: outputPath,
		header: csvHeader,
	});
	await csvWriter.writeRecords(records);
}
