import { parseImageTimetable, writeCsv } from './imageTableOcr.js';

const [inputDir = 'data/images', outputCsv = 'data/output.csv'] = process.argv.slice(2);

async function main() {
  console.log('入力画像ディレクトリ:', inputDir);
  console.log('出力CSV:', outputCsv);

  try {
    const records = await parseImageTimetable(inputDir);
    if (records.length === 0) {
      console.warn('CSVに書き出すレコードが見つかりませんでした。設定を確認してください。');
      return;
    }

    await writeCsv(records, outputCsv);
    console.log(`CSVを出力しました: ${outputCsv}`);
  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    process.exit(1);
  }
}

main();
