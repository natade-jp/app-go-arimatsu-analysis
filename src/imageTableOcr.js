import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { createObjectCsvWriter } from 'csv-writer';
import { pageLayouts } from './tableConfig.js';

const csvHeader = [
  { id: '運行日区分', title: '運行日区分' },
  { id: '改正日', title: '改正日' },
  { id: 'ページ番号', title: 'ページ番号' },
  { id: '列車番号', title: '列車番号' },
  { id: '運行種別', title: '運行種別' },
  { id: '行先', title: '行先' },
  { id: '名鉄名古屋 着', title: '名鉄名古屋 着' },
  { id: '名鉄名古屋 発', title: '名鉄名古屋 発' },
  { id: '金山 着', title: '金山 着' },
  { id: '金山 発', title: '金山 発' },
  { id: '鳴海 着', title: '鳴海 着' },
  { id: '鳴海 発', title: '鳴海 発' },
  { id: '有松 着', title: '有松 着' }
];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp']);

export async function parseImageTimetable(imageDir) {
  const imageFiles = await getImageFiles(imageDir);
  if (imageFiles.length === 0) {
    throw new Error(`画像ファイルが見つかりません: ${imageDir}`);
  }

  const worker = await createWorker({
    logger: (m) => {
      if (m.status === 'recognizing text') {
        console.log(`[OCR] ${m.status} ${Math.round((m.progress || 0) * 100)}%`);
      }
    }
  });

  await worker.load();
  await worker.loadLanguage('jpn');
  await worker.initialize('jpn');

  const records = [];
  for (const [index, fileName] of imageFiles.entries()) {
    const pageNumber = getPageNumber(fileName) || index + 1;
    const layout = pageLayouts[pageNumber % 2 === 1 ? 'odd' : 'even'];
    if (!layout) {
      console.warn(`ページ ${pageNumber} のレイアウトが見つかりません。スキップします: ${fileName}`);
      continue;
    }

    console.log(`解析中: ${fileName} (ページ ${pageNumber}, ${layout.name}ページレイアウト)`);
    const pageRecords = await parsePageImage(fileName, imageDir, pageNumber, layout, worker);
    records.push(...pageRecords);
  }

  await worker.terminate();
  return records;
}

export async function writeCsv(records, outputPath) {
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: csvHeader
  });
  await csvWriter.writeRecords(records);
}

async function getImageFiles(imageDir) {
  const entries = await fs.readdir(imageDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => compareImageNames(a.name, b.name))
    .map((entry) => entry.name);
}

function compareImageNames(a, b) {
  const aNum = getPageNumber(a) || Number.MAX_SAFE_INTEGER;
  const bNum = getPageNumber(b) || Number.MAX_SAFE_INTEGER;
  if (aNum !== bNum) return aNum - bNum;
  return a.localeCompare(b, 'ja');
}

function getPageNumber(fileName) {
  const match = fileName.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

async function parsePageImage(fileName, imageDir, pageNumber, layout, worker) {
  const filePath = path.join(imageDir, fileName);
  const image = sharp(filePath);
  const metadata = await image.metadata();

  const left = layout.tableRect.left;
  const top = layout.tableRect.top;
  const tableWidth = layout.tableRect.right - layout.tableRect.left;
  const tableHeight = layout.tableRect.bottom - layout.tableRect.top;
  const columnWidth = Math.floor(tableWidth / layout.columns);

  const pageRecords = [];
  for (let columnIndex = 0; columnIndex < layout.columns; columnIndex += 1) {
    const columnLeft = left + columnIndex * columnWidth;
    const width = columnIndex === layout.columns - 1
      ? Math.max(0, layout.tableRect.right - columnLeft)
      : columnWidth;

    if (columnLeft + width > metadata.width) {
      console.warn(`列 ${columnIndex + 1} の幅が画像範囲を超えています。調整が必要です。`);
      continue;
    }

    const columnBuffer = await image
      .extract({ left: columnLeft, top, width, height: tableHeight })
      .png()
      .toBuffer();

    const record = {
      '運行日区分': layout.operatingDay,
      '改正日': layout.revisionDate,
      'ページ番号': pageNumber
    };

    for (const field of layout.fields) {
      const cropTop = Math.max(0, field.y - layout.rowMargin);
      const cropHeight = Math.min(field.height + layout.rowMargin * 2, tableHeight - cropTop);

      if (cropTop + cropHeight > tableHeight) {
        console.warn(`フィールド ${field.key} の切り出し範囲がページ範囲を超えました。調整してください。`);
      }

      const fieldBuffer = await sharp(columnBuffer)
        .extract({ left: 0, top: cropTop, width, height: cropHeight })
        .png()
        .toBuffer();

      const rawText = await recognizeText(worker, fieldBuffer);
      record[field.key] = normalizeField(field.key, rawText);
    }

    pageRecords.push(record);
  }

  return pageRecords;
}

async function recognizeText(worker, imageBuffer) {
  const { data } = await worker.recognize(imageBuffer);
  return (data.text || '').trim();
}

function normalizeField(key, text) {
  const normalized = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (['名鉄名古屋 着', '名鉄名古屋 発', '金山 着', '金山 発', '鳴海 着', '鳴海 発', '有松 着'].includes(key)) {
    return normalizeTime(normalized);
  }
  if (key === '列車番号') {
    return normalized.replace(/[^0-9０-９]/g, '').replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xFF10));
  }
  return normalized;
}

function normalizeTime(text) {
  const match = text.match(/([0-2]?[0-9])\D?([0-5][0-9])/);
  if (!match) {
    return text;
  }
  const hh = match[1].padStart(2, '0');
  const mm = match[2];
  return `${hh}${mm}`;
}
