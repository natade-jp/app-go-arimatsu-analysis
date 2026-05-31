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

2. PDFを画像化して、`data/images/` にページごとの画像を配置

```bash
mkdir -p data/images
pdftoppm -png timetable.pdf data/images/page
```

3. 画像解析を実行

```bash
npm run parse-images
```

4. 出力CSVは `data/output.csv` に保存されます。

## 解析の流れ

1. PDFを外部ツールでPNG等の画像に変換
2. 画像のテーブル領域と列数を設定
3. 各列ごとに縦に並んだ項目ごとに切り出し
4. Tesseract OCRで文字列を抽出しCSV化

## ディレクトリ構成

- `src/`
  - `index.js` - エントリーポイント
  - `pdfParser.js` - PDF読み込み・解析・CSV生成のロジック
- `data/` - PDF資料や出力CSVを置く場所

## 今後の対応

- OCRを使ったPDFの文字抽出
- 名鉄時刻表のレイアウトに応じたテーブル解析
- 名古屋駅〜有松駅に絞ったCSV生成
- 解析精度を上げるための例外処理とログ出力
