import { pageLayouts } from "./tableConfig.js";

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

export function getPageNumber(fileName) {
	const match = fileName.match(/(\d+)/);
	return match ? Number(match[1]) : null;
}

export function getLayoutForPage(pageNumber) {
	return pageLayouts[pageNumber % 2 === 1 ? "odd" : "even"];
}

export function compareImageNames(a, b) {
	const aNum = getPageNumber(a) || Number.MAX_SAFE_INTEGER;
	const bNum = getPageNumber(b) || Number.MAX_SAFE_INTEGER;
	if (aNum !== bNum) return aNum - bNum;
	return a.localeCompare(b, "ja");
}

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
