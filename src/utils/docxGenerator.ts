import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  AlignmentType,
  BorderStyle,
  ShadingType,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import type { WordPair } from '../services/geminiService';
import type { WordPairDocument } from '../services/geminiService';

// ── Shared style constants (sizes in half-points: 16pt=32, 11pt=22, 10.5pt=21) ──
const FONT_YAHEI = '微软雅黑';
const FONT_ARIAL = 'Arial';
const HEADER_BG = 'D9E2F3';   // blue header
const STRIPE_BG = 'F2F2F2';   // light gray stripe
const GRAY_TEXT = 'C8C8C8';   // pale gray placeholder

const thinBorder = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: 'BFBFBF',
};

const cellBorders = {
  top: thinBorder,
  bottom: thinBorder,
  left: thinBorder,
  right: thinBorder,
};

// ── Helpers ──
function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        font: { name: FONT_YAHEI, eastAsia: FONT_YAHEI },
        size: 32, // 16pt
      }),
    ],
  });
}

function subtitleParagraph(): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: 'English          中文          默写区',
        font: { name: FONT_YAHEI, eastAsia: FONT_YAHEI },
        size: 22, // 11pt
        color: '808080',
      }),
    ],
  });
}

// ── Table builders ──
interface ColumnDef {
  text: string;
  font: string;
  alignment: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT;
}

function makeHeaderCell(col: ColumnDef): TableCell {
  return new TableCell({
    shading: { fill: HEADER_BG, type: ShadingType.CLEAR },
    verticalAlign: 'center',
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: col.text,
            bold: true,
            font: { name: col.font, eastAsia: col.font },
            size: 22, // 11pt
          }),
        ],
      }),
    ],
  });
}

/**
 * Build one data row: foreign word | Chinese | practice area.
 * `fillBg` controls alternating stripe.
 */
function makeDataRow(
  foreign: string,
  chinese: string,
  foreignFont: string,
  fillBg: boolean,
): TableRow {
  const bg = fillBg ? { fill: STRIPE_BG, type: ShadingType.CLEAR } : undefined;

  const foreignCell = new TableCell({
    shading: bg,
    verticalAlign: 'center',
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: foreign,
            bold: true,
            font: { name: foreignFont },
            size: 21, // 10.5pt
          }),
        ],
      }),
    ],
  });

  const chineseCell = new TableCell({
    shading: bg,
    verticalAlign: 'center',
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: chinese,
            font: { name: FONT_YAHEI, eastAsia: FONT_YAHEI },
            size: 21,
          }),
        ],
      }),
    ],
  });

  const practiceCell = new TableCell({
    shading: bg,
    verticalAlign: 'center',
    borders: cellBorders,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: '', // blank — user writes here
            font: { name: FONT_ARIAL },
            size: 21,
            color: GRAY_TEXT,
          }),
        ],
      }),
    ],
  });

  return new TableRow({ children: [foreignCell, chineseCell, practiceCell] });
}

// ── Public API ──

/**
 * Build one data row for document mode: kana | kanji | chinese | practice.
 */
function makeDocumentDataRow(item: WordPairDocument, fillBg: boolean): TableRow {
  const bg = fillBg ? { fill: STRIPE_BG, type: ShadingType.CLEAR } : undefined;

  const makeCell = (text: string, align: typeof AlignmentType.CENTER | typeof AlignmentType.LEFT) =>
    new TableCell({
      shading: bg,
      verticalAlign: 'center',
      borders: cellBorders,
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({
              text: text || (align === AlignmentType.LEFT ? '—' : ''),
              font: { name: FONT_YAHEI, eastAsia: FONT_YAHEI },
              size: 21,
              ...(align === AlignmentType.LEFT && !text ? { color: '999999' } : {}),
            }),
          ],
        }),
      ],
    });

  return new TableRow({
    children: [
      makeCell(item.kana, AlignmentType.LEFT),
      makeCell(item.kanji, AlignmentType.LEFT),
      makeCell(item.cn, AlignmentType.CENTER),
      makeCell(item.example, AlignmentType.LEFT),
      new TableCell({
        shading: bg,
        verticalAlign: 'center',
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: '',
                font: { name: FONT_ARIAL },
                size: 21,
                color: GRAY_TEXT,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Generate a .docx Blob from extracted word pairs.
 *
 * Japanese words include their reading in the table cell (e.g. "漢字（かんじ）").
 * English words are shown as-is.
 * Document mode: 4-column layout (kana | kanji | chinese | practice).
 */
export async function generateDocx(
  wordPairs: WordPair[],
  language: 'japanese' | 'english' | 'document',
  fileName?: string,
): Promise<Blob> {
  const isJapanese = language === 'japanese';
  const isDocument = language === 'document';

  // Title from file name hint, or generic
  const title = fileName ?? (isDocument ? '日语单词表（文档）' : isJapanese ? '日语单词表' : '英语单词表');

  // Build header columns
  let headerCols: ColumnDef[];
  if (isDocument) {
    headerCols = [
      { text: '日文假名 (Kana)', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '日汉字 (Kanji)', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '中文意思', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '例句 (Example)', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '默写区（抄写/听写）', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
    ];
  } else if (isJapanese) {
    headerCols = [
      { text: '日语 (Japanese)', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '中文意思', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '默写区（抄写/听写）', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
    ];
  } else {
    headerCols = [
      { text: 'English', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '中文意思', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
      { text: '默写区（抄写/听写）', font: FONT_YAHEI, alignment: AlignmentType.CENTER },
    ];
  }

  const headerRow = new TableRow({
    children: headerCols.map((c) => makeHeaderCell(c)),
  });

  // Build data rows
  let dataRows: TableRow[];
  if (isDocument) {
    dataRows = (wordPairs as WordPairDocument[]).map((item, i) =>
      makeDocumentDataRow(item, i % 2 === 0)
    );
  } else {
    dataRows = wordPairs.map((item, i) => {
      let foreign: string;
      const foreignFont = isJapanese ? FONT_YAHEI : FONT_ARIAL;

      if ('ja' in item) {
        foreign = item.reading ? `${item.ja}（${item.reading}）` : item.ja;
      } else {
        foreign = (item as any).en;
      }

      return makeDataRow(foreign, item.cn, foreignFont, i % 2 === 0);
    });
  }

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
      insideHorizontal: thinBorder,
      insideVertical: thinBorder,
    },
    rows: [headerRow, ...dataRows],
  });

  // Subtitle for non-document mode
  const docChildren: any[] = [titleParagraph(title)];
  if (!isDocument) {
    docChildren.push(subtitleParagraph());
  }
  docChildren.push(table);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(25),
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return Packer.toBlob(doc);
}
