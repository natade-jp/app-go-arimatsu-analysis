// @ts-check

import sharp from "sharp";
import { pageLayouts } from "./tableConfig.js";

/**
 * CSVヘッダー定義
 * @typedef {Object} CsvHeaderItem
 * @property {string} id CSV出力時のキー
 * @property {string} title CSVヘッダー名
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
 * OCR対象フィールド定義
 * @typedef {Object} LayoutField
 * @property {string} key 出力項目名
 * @property {number} y 列画像内のY座標
 * @property {number} height 切り出し高さ
 */

/**
 * ページ解析用レイアウト定義
 * @typedef {Object} PageLayout
 * @property {string} name レイアウト名
 * @property {number} columns 列数
 * @property {number} rowMargin 項目切り出し時の上下余白
 * @property {number} horizontalMargin 項目切り出し画像の左右を白で塗りつぶす幅
 * @property {string} operatingDay 運行日区分
 * @property {string} revisionDate 改正日
 * @property {TableRect} tableRect テーブル領域
 * @property {LayoutField[]} fields OCR対象フィールド一覧
 */

/**
 * 列切り出し用矩形
 * @typedef {Object} ColumnRect
 * @property {number} left 左端X座標
 * @property {number} top 上端Y座標
 * @property {number} width 幅
 * @property {number} height 高さ
 */

/** @type {CsvHeaderItem[]} */
export const csvHeader = [
	{ id: "運行日区分", title: "運行日区分" },
	{ id: "改正日", title: "改正日" },
	{ id: "ページ番号", title: "ページ番号" },
	{ id: "列番号", title: "列番号" },
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
	{ id: "備考", title: "備考" },
];

/**
 * ファイル名からページ番号を取得する
 * @param {string} fileName ファイル名
 * @returns {?number} ページ番号
 */
export function getPageNumber(fileName) {
	const match = fileName.match(/(\d+)/);
	return match ? Number(match[1]) : null;
}

/**
 * ページ番号に対応するレイアウト定義を取得する
 * @param {number} pageNumber ページ番号
 * @returns {PageLayout} ページ解析用レイアウト定義
 */
export function getLayoutForPage(pageNumber) {
	return pageLayouts[pageNumber % 2 === 1 ? "odd" : "even"];
}

/**
 * 画像ファイル名をページ番号順に比較する
 * @param {string} a 比較対象の画像ファイル名
 * @param {string} b 比較対象の画像ファイル名
 * @returns {number} 比較結果
 */
export function compareImageNames(a, b) {
	const aNum = getPageNumber(a) ?? Number.MAX_SAFE_INTEGER;
	const bNum = getPageNumber(b) ?? Number.MAX_SAFE_INTEGER;
	if (aNum !== bNum) return aNum - bNum;
	return a.localeCompare(b, "ja");
}

/**
 * 指定列の切り出し矩形を取得する
 * @param {PageLayout} layout ページ解析用レイアウト定義
 * @param {number} columnIndex 列インデックス
 * @returns {ColumnRect} 列切り出し用矩形
 */
export function getColumnRect(layout, columnIndex) {
	const left = layout.tableRect.left;
	const top = layout.tableRect.top;
	const tableWidth = layout.tableRect.right - layout.tableRect.left;
	const columnWidths = Array(layout.columns).fill(tableWidth / layout.columns);

	const offsetLeft = Math.round(left + columnWidths.slice(0, columnIndex).reduce((sum, w) => sum + w, 0));
	const right = Math.round(left + columnWidths.slice(0, columnIndex + 1).reduce((sum, w) => sum + w, 0));

	return {
		left: offsetLeft,
		top,
		width: right - offsetLeft,
		height: layout.tableRect.bottom - layout.tableRect.top,
	};
}

/**
 * 左右の縦線を消すために、指定幅分を白で塗りつぶす
 * @param {Buffer} buffer 元画像バッファ
 * @param {number} width 画像幅
 * @param {number} height 画像高さ
 * @param {number} margin 左右それぞれの白塗り幅
 * @returns {Promise<Buffer>} 白塗り後の画像バッファ
 */
export async function blankMarginAreas(buffer, width, height, { left = 0, right = 0, top = 0, bottom = 0 } = {}) {
	const leftMargin = Math.min(Math.max(0, left), Math.floor(width / 2));
	const rightMargin = Math.min(Math.max(0, right), Math.floor(width / 2));
	const topMargin = Math.min(Math.max(0, top), Math.floor(height / 2));
	const bottomMargin = Math.min(Math.max(0, bottom), Math.floor(height / 2));

	if (leftMargin === 0 && rightMargin === 0 && topMargin === 0 && bottomMargin === 0) {
		return buffer;
	}

	const composites = [];

	if (leftMargin > 0) {
		const leftStrip = await sharp({
			create: {
				width: leftMargin,
				height: height,
				channels: 4,
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			},
		})
			.png()
			.toBuffer();
		composites.push({ input: leftStrip, left: 0, top: 0 });
	}

	if (rightMargin > 0) {
		const rightStrip = await sharp({
			create: {
				width: rightMargin,
				height: height,
				channels: 4,
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			},
		})
			.png()
			.toBuffer();
		composites.push({ input: rightStrip, left: width - rightMargin, top: 0 });
	}

	if (topMargin > 0) {
		const topStrip = await sharp({
			create: {
				width: width,
				height: topMargin,
				channels: 4,
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			},
		})
			.png()
			.toBuffer();
		composites.push({ input: topStrip, left: 0, top: 0 });
	}

	if (bottomMargin > 0) {
		const bottomStrip = await sharp({
			create: {
				width: width,
				height: bottomMargin,
				channels: 4,
				background: { r: 255, g: 255, b: 255, alpha: 1 },
			},
		})
			.png()
			.toBuffer();
		composites.push({ input: bottomStrip, left: 0, top: height - bottomMargin });
	}

	return sharp(buffer).composite(composites).png().toBuffer();
}

export async function blankHorizontalBorders(buffer, width, height, margin) {
	return blankMarginAreas(buffer, width, height, { left: margin, right: margin });
}
