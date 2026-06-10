# 名鉄名古屋〜有松 乗換CSVジェネレータ

このリポジトリは、名鉄の時刻表PDFから名古屋駅〜有松駅の列車時刻データを抽出し、CSV形式で出力するためのツールを構築するための土台です。

## 目的

- PDFのみ公開されている名鉄時刻表のデータを、CSVに変換して分析や乗換案内ツールに活用する。
- 2026年3月14日の改正に対応した最新データを生成する。

## 使い方

1. 依存パッケージをインストール

```bash
npm install
```

2. PDFを高解像度で画像化して、`data/images/` にページごとの画像を配置

```bash
mkdir -p data/images
pdftoppm -png -r 400 timetable.pdf data/images/page
```

※ WSL2 で `pdftoppm` をインストールして実行

3. 画像の解像度と座標を確認します

```bash
npm run inspect-image -- data/images/page-01.png
```

4. 1列だけ切り出して確認します

```bash
npm run extract-column -- data/images/page-01.png 0
```

5. 画像解析を実行

```bash
npm run parse-images
```

6. 出力CSVは `data/output.csv` に保存されます。

7. 出力CSVを時刻整合性のチェックをする

```bash
npm run validate-csv -- data/output.csv
```

## OCR結果の補正

どうしても解析が難しい箇所は目視で確認が必要となります。
そのために、以下のように画像ファイルと列番号のCSVを作成し、

`columns.csv`

```
./data/images/page-01.png,4
./data/images/page-01.png,7
./data/images/page-01.png,9
```

以下を実行すると複数列をまとめて結合画像を作成します。

```bash
npm run concat-columns -- data/columns.csv output.png
```

これによりさらにOCR結果を修正してください。

## 解析の流れ

1. PDFを`pdftoppm` でPNG画像に変換
2. 画像のテーブル領域と列数を設定
3. `extract-column` で各列ごとに縦に並んだ項目ごとに切り出して設定値を作成
4. `parse-images` でTesseract OCRで文字列を抽出しCSV化
5. `concat-columns` で狙いのページの列だけを一括画像化し、目視でCSVを修正

## 画像レイアウト設定について

- `src/tableConfig.js` の `tableRect` はテーブル全体の左上/右下座標
- `fields[].y` は `tableRect.top` からの相対位置
- `columns` は横に並んだ列数
- 必要なら `columnWidths` で列ごとの横幅を個別指定できます

## ディレクトリ構成

- `src/`
    - `index.js` - エントリーポイント
    - `imageTableOcr.js` - 画像OCR解析ロジック
    - `tableConfig.js` - 画像レイアウト設定
    - `concatColumns.js` - 複数列の縦長画像を結合して出力
- `data/` - PDF資料や出力CSVを置く場所
