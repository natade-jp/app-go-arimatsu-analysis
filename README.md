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

5. 出力CSVは `data/output.csv` に保存されます。

## 解析の流れ

1. PDFを外部ツールでPNG等の画像に変換
2. 画像のテーブル領域と列数を設定
3. 各列ごとに縦に並んだ項目ごとに切り出し
4. Tesseract OCRで文字列を抽出しCSV化

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
- `data/` - PDF資料や出力CSVを置く場所

## 今後の対応

- OCRを使ったPDFの文字抽出
- 名鉄時刻表のレイアウトに応じたテーブル解析
- 名古屋駅〜有松駅に絞ったCSV生成
- 解析精度を上げるための例外処理とログ出力
