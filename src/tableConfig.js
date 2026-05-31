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
			{ key: "列車番号", y: 2, height: 44 },
			{ key: "運行種別", y: 72, height: 52 },
			{ key: "行先", y: 179, height: 97 },
			{ key: "名鉄名古屋 着", y: 1578, height: 40 },
			{ key: "名鉄名古屋 発", y: 1621, height: 40 },
			{ key: "金山 着", y: 1698, height: 40 },
			{ key: "金山 発", y: 1742, height: 40 },
			{ key: "鳴海 着", y: 2065, height: 40 },
			{ key: "鳴海 発", y: 2109, height: 40 },
			{ key: "有松 着", y: 2189, height: 40 },
			{ key: "備考", y: 3533, height: 160 },
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
			{ key: "列車番号", y: 2, height: 44 },
			{ key: "運行種別", y: 72, height: 52 },
			{ key: "行先", y: 179, height: 97 },
			{ key: "名鉄名古屋 着", y: 1578, height: 40 },
			{ key: "名鉄名古屋 発", y: 1621, height: 40 },
			{ key: "金山 着", y: 1698, height: 40 },
			{ key: "金山 発", y: 1742, height: 40 },
			{ key: "鳴海 着", y: 2065, height: 40 },
			{ key: "鳴海 発", y: 2109, height: 40 },
			{ key: "有松 着", y: 2189, height: 40 },
			{ key: "備考", y: 3533, height: 160 },
		],
	},
};
