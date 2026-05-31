# AGENTS

## プロジェクト名

名鉄名古屋〜有松 乗換CSVジェネレータ

## 目的

- 名鉄の時刻表PDFから名古屋駅〜有松駅の乗換用CSVを生成するツールを構築する。
- PDFから直接OCRすると失敗しやすいため、画像化した上でテーブル領域と列を切り出し、OCRを適用する。
- 2026年3月14日の改正に対応する最新データを扱う。

## これまでの流れ

1. 空のリポジトリに Node.js プロジェクトを初期化
2. `src/index.js` / `src/pdfParser.js` など基本構造を生成
3. `tesseract.js` と `sharp` による画像OCRパイプラインを導入
4. `README.md` に実行手順と考え方を記載
5. `pdftoppm` を利用し、PDFをPNG画像に変換する方針を決定
6. 低解像度ではOCR精度が落ちるため、`pdftoppm -r 400` の高解像度出力を推奨
7. `src/tableConfig.js` で奇数ページ/偶数ページごとの `tableRect` と `columns` を設定
8. 画像サイズ確認用 `src/inspectImage.js` を追加
9. 1列切り出し用 `src/extractColumn.js` を追加
10. `data/images/` のPNGファイルはコミット対象外とするため `.gitignore` に追加

## 主要ファイル

- `README.md` - 目的、実行手順、解析の考え方
- `package.json` - スクリプトと依存関係
- `src/index.js` - エントリーポイント、画像解析を呼び出す
- `src/imageTableOcr.js` - テーブル領域の列ごと切り出しとOCR処理
- `src/tableConfig.js` - 奇数/偶数ページのレイアウト設定
- `src/inspectImage.js` - 画像の幅/高さを確認するヘルパー
- `src/extractColumn.js` - 1列切り出し用ヘルパー

## 今の状態

- ソースコードは作成済み
- 依存関係は `npm install` でインストール済み
- `data/images/` に `pdftoppm` で生成したPNGが存在している
- 画像ファイルはリポジトリに含めない設定になっている

## 次の作業

1. `npm run inspect-image -- data/images/page-01.png` で画像サイズ確認
2. `npm run extract-column -- data/images/page-01.png 0` で1列切り出しを確認
3. `src/tableConfig.js` の `fields` の `y` / `height` を切り出した画像に合わせて調整
4. その後 `npm run parse-images` でOCR解析を実行し、CSV出力結果を確認

## リポジトリ運用

- 画像ファイルは大きく、生成物のため `data/images/` は `.gitignore` で無視する
- ソースと設定のみをコミットし、再現手順を明確に保つ
- 今後は `fields` の位置調整とOCR精度改善にフォーカスする
