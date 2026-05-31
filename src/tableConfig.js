// pageLayouts には奇数ページ・偶数ページのレイアウトを定義します。
//
// - tableRect: テーブル全体の矩形領域
// - columns: テーブルの列数（列が均等幅の場合）
// - columnWidths: 列ごとの幅を個別指定する場合はこちら
// - fields[].y: tableRect.top からの相対 Y 座標
// - fields[].height: 項目領域の高さ
export const pageLayouts = {
	odd: {
		name: "odd",
		operatingDay: "平日",
		revisionDate: "2026/3/14",
		tableRect: {
			left: 599,
			top: 179,
			right: 2665,
			bottom: 3915,
		},
		columns: 20,
		rowMargin: 8,
		fields: [
			{ key: "列車番号", y: 100, height: 80 },
			{ key: "運行種別", y: 190, height: 70 },
			{ key: "行先", y: 285, height: 90 },
			{ key: "名鉄名古屋 着", y: 420, height: 70 },
			{ key: "名鉄名古屋 発", y: 520, height: 70 },
			{ key: "金山 着", y: 620, height: 70 },
			{ key: "金山 発", y: 720, height: 70 },
			{ key: "鳴海 着", y: 820, height: 70 },
			{ key: "鳴海 発", y: 920, height: 70 },
			{ key: "有松 着", y: 1030, height: 70 },
		],
	},
	even: {
		name: "even",
		operatingDay: "平日",
		revisionDate: "2026/3/14",
		tableRect: {
			left: 196,
			top: 179,
			right: 2261,
			bottom: 3915,
		},
		columns: 20,
		rowMargin: 8,
		fields: [
			{ key: "列車番号", y: 100, height: 80 },
			{ key: "運行種別", y: 190, height: 70 },
			{ key: "行先", y: 285, height: 90 },
			{ key: "名鉄名古屋 着", y: 420, height: 70 },
			{ key: "名鉄名古屋 発", y: 520, height: 70 },
			{ key: "金山 着", y: 620, height: 70 },
			{ key: "金山 発", y: 720, height: 70 },
			{ key: "鳴海 着", y: 820, height: 70 },
			{ key: "鳴海 発", y: 920, height: 70 },
			{ key: "有松 着", y: 1030, height: 70 },
		],
	},
};
