// @ts-check

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
 * ページ解析用レイアウト定義
 * @typedef {Object} PageLayout
 * @property {TableRect} tableRect テーブル領域
 * @property {number} columns 列数
 * @property {number[]} [columnWidths] 列ごとの幅
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
	const columnWidths = layout.columnWidths || Array(layout.columns).fill(tableWidth / layout.columns);

	const offsetLeft = Math.round(left + columnWidths.slice(0, columnIndex).reduce((sum, w) => sum + w, 0));
	const right = Math.round(left + columnWidths.slice(0, columnIndex + 1).reduce((sum, w) => sum + w, 0));

	return {
		left: offsetLeft,
		top,
		width: right - offsetLeft,
		height: layout.tableRect.bottom - layout.tableRect.top,
	};
}
