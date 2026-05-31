import fs from "fs/promises";
import pdf from "pdf-parse";
import { createObjectCsvWriter } from "csv-writer";

const csvHeader = [
	{ id: "運行日区分", title: "運行日区分" },
	{ id: "改正日", title: "改正日" },
	{ id: "ページ番号", title: "ページ番号" },
	{ id: "列車番号", title: "列車番号" },
	{ id: "運行種別", title: "運行種別" },
	{ id: "行先", title: "行先" },
	{ id: "名鉄名古屋 着", title: "名鉄名古屋 着" },
	{ id: "名鉄名古屋 発", title: "名鉄名古屋 発" },
	{ id: "金山 着", title: "金山 着" },
	{ id: "金山 発", title: "金山 発" },
	{ id: "鳴海 着", title: "鳴海 着" },
	{ id: "鳴海 発", title: "鳴海 発" },
	{ id: "有松 着", title: "有松 着" },
];

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
