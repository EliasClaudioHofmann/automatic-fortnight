export type ReviewStatus = 'pending' | 'confirmed' | 'skipped';

export interface Candidate {
  id: string;
  sourceLine: number;
  sourceType?: 'text' | 'docx-table' | 'txt-table';
  raw: string;
  expression: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  pitch: string;
  example: string;
  exampleRaw?: string;
  exampleReading?: string;
  exampleMeaning?: string;
  exampleParseStatus?: 'parsed' | 'needs-review' | 'missing';
  note: string;
  status: ReviewStatus;
}

const docxHeaders = {
  kana: ['日文假名', 'kana'],
  kanji: ['日汉字', 'kanji'],
  meaning: ['中文意思', '中文释义', 'meaning'],
  example: ['例句', 'example'],
} as const;

function normalizeHeader(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s()（）:：]/g, '');
}

function headerKind(value: string): keyof typeof docxHeaders | undefined {
  const normalized = normalizeHeader(value);
  return (Object.keys(docxHeaders) as Array<keyof typeof docxHeaders>)
    .find(kind => docxHeaders[kind].some(alias => normalized === normalizeHeader(alias) ||
      normalized.endsWith(normalizeHeader(alias))));
}

function parseExampleCell(raw: string): Pick<Candidate, 'example' | 'exampleRaw' | 'exampleReading' | 'exampleMeaning' | 'exampleParseStatus'> {
  const exampleRaw = raw.trim();
  if (!exampleRaw) {
    return { example: '', exampleRaw: '', exampleReading: '', exampleMeaning: '', exampleParseStatus: 'missing' };
  }
  // Only split the verified DOCX shape: Japanese sentence（sentence reading）（Chinese translation）.
  // Any other punctuation/shape remains visible in exampleRaw and requires human review.
  const match = exampleRaw.match(/^([^（）]+)（([^（）]*)）[（]([^（）]*)）$/);
  if (!match || !match[1].trim() || !match[2].trim() || !match[3].trim()) {
    return { example: '', exampleRaw, exampleReading: '', exampleMeaning: '', exampleParseStatus: 'needs-review' };
  }
  return {
    example: match[1].trim(), exampleRaw,
    exampleReading: match[2].trim(), exampleMeaning: match[3].trim(),
    exampleParseStatus: 'parsed',
  };
}

export function parseDocxTableRows(rows: string[][]): Candidate[] {
  if (rows.length === 0) throw new Error('DOCX 表格为空，无法读取表头');
  const header = rows[0];
  const columns = new Map<keyof typeof docxHeaders, number>();
  header.forEach((cell, index) => {
    const kind = headerKind(cell);
    if (!kind) return;
    if (columns.has(kind)) throw new Error(`DOCX 表头重复：${kind}`);
    columns.set(kind, index);
  });
  for (const kind of Object.keys(docxHeaders) as Array<keyof typeof docxHeaders>) {
    if (!columns.has(kind)) throw new Error(`DOCX 表头缺少必需列：${kind}`);
  }

  const cell = (row: string[], kind: keyof typeof docxHeaders) => row[columns.get(kind)!]?.trim() ?? '';
  const candidates: Candidate[] = [];
  rows.slice(1).forEach((row, index) => {
    if (row.length < header.length) throw new Error(`DOCX 表格第 ${index + 2} 行列数不完整`);
    if (row.every(value => !value.trim())) return;
    // Some Word exports repeat the table header after a page break.
    if (row.every((value, column) => normalizeHeader(value) === normalizeHeader(header[column] ?? ''))) return;

    const kana = cell(row, 'kana');
    const kanji = cell(row, 'kanji');
    const example = parseExampleCell(cell(row, 'example'));
    candidates.push({
      id: String(index + 2), sourceLine: index + 2, sourceType: 'docx-table',
      raw: row.join('\t'),
      expression: kanji && kanji !== '—' ? kanji : kana,
      reading: kana,
      meaning: cell(row, 'meaning'),
      partOfSpeech: '', pitch: '', note: '', status: 'pending',
      ...example,
    });
  });
  return candidates;
}

const txtTableGuidance = 'TXT 无法安全解析：请提供含 Kana、Kanji、中文意思、Example 表头的制表符分隔 TSV 式文本；普通自然语言 TXT 不支持自动生成。';

export function parseTxtTable(text: string): Candidate[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length || !lines[0].includes('\t')) throw new Error(txtTableGuidance);

  const rows = lines.map(line => line.split('\t'));
  const headingKinds = rows[0].map(headerKind);
  const recognizedKinds = headingKinds.filter((kind): kind is keyof typeof docxHeaders => kind !== undefined);
  if (recognizedKinds.length !== Object.keys(docxHeaders).length ||
    new Set(recognizedKinds).size !== Object.keys(docxHeaders).length) {
    throw new Error(`${txtTableGuidance} 表头缺少必需列或存在重复列。`);
  }
  try {
    for (let index = 1; index < rows.length; index++) {
      if (rows[index].every(value => !value.trim())) continue;
      if (rows[index].length !== rows[0].length) {
        throw new Error(`第 ${index + 1} 行列数与表头不一致`);
      }
    }
    return parseDocxTableRows(rows).map(candidate => ({ ...candidate, sourceType: 'txt-table' }));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : '表格结构无效';
    throw new Error(`${txtTableGuidance} ${detail}`);
  }
}

export function parseDocxHtml(html: string): Candidate[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(document.querySelectorAll('table'));
  const recognized: HTMLTableElement[] = [];
  for (const table of tables) {
    const firstRow = table.rows.item(0);
    if (!firstRow) continue;
    const headings = Array.from(firstRow.cells, cell => cell.textContent ?? '');
    const kinds = headings.map(headerKind).filter((kind): kind is keyof typeof docxHeaders => kind !== undefined);
    if (kinds.length === 0) continue;
    if (kinds.length < Object.keys(docxHeaders).length) {
      throw new Error('DOCX 表格包含词汇表头，但缺少必需列；请检查日文假名、日汉字、中文意思和例句列');
    }
    recognized.push(table);
  }
  if (recognized.length > 1) throw new Error('DOCX 中发现多个词汇表格，无法安全合并；请分开导入');
  if (recognized.length === 1) {
    const table = recognized[0];
    const rows = Array.from(table.rows, row => Array.from(row.cells, cell => {
      const paragraphs = Array.from(cell.querySelectorAll('p'));
      if (paragraphs.length) {
        return paragraphs.map(paragraph => (paragraph as HTMLElement).innerText ?? paragraph.textContent ?? '').join('\n').trim();
      }
      return (cell as HTMLElement).innerText ?? cell.textContent ?? '';
    }));
    return parseDocxTableRows(rows);
  }
  if (tables.length > 0) throw new Error('未识别到受支持的 DOCX 词汇表表头；为避免错分，未按纯文本导入');
  const text = (document.body as HTMLElement).innerText ?? document.body.textContent ?? '';
  return parseCandidates(text);
}

const heading = /^(?:\d{4}[年/.-]\d{1,2}(?:[月/.-]\d{1,2}日?)?|[Nn][1-5]|第[一二三四五六七八九十\d]+[课章]|(?:日期|单词|词汇|復習|复习)[:：]?)/;
const divider = /^(\S.{0,30}?)\s*(?:\t+|[：:]|\s+[—–-]\s+| {2,})(.+)$/;

export function parseCandidates(text: string): Candidate[] {
  const result: Candidate[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (/^\s+/.test(raw) || /^(?:例[文句]?|例如|搭配|注[释意]|备注)[:：]/.test(trimmed)) {
      const last = result[result.length - 1];
      if (last) {
        last.raw += `\n${raw}`;
        const example = trimmed.match(/^(?:例[文句]?|例如)[:：]\s*(.+)$/);
        if (example && !last.example) last.example = example[1];
        else if (!example) last.note += (last.note ? '\n' : '') + trimmed;
      }
      continue;
    }
    if (heading.test(trimmed) || trimmed.length > 100) continue;
    const match = trimmed.match(divider);
    if (!match) continue;
    const expression = match[1].trim();
    const meaning = match[2].trim();
    // A separator alone is insufficient: require Japanese script and a short headword.
    if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(expression) || expression.length > 32 || !meaning) continue;
    if (/^(?:例[文句]?|搭配|注[释意]|备注)/.test(expression)) continue;
    result.push({
      id: String(index + 1), sourceLine: index + 1, sourceType: 'text', raw,
      expression, reading: '', meaning, partOfSpeech: '', pitch: '',
      example: '', exampleRaw: '', exampleReading: '', exampleMeaning: '',
      exampleParseStatus: 'missing', note: '', status: 'pending'
    });
  }
  return result;
}

export function confirmedCards(candidates: Candidate[]): Candidate[] {
  return candidates.filter(candidate => candidate.status === 'confirmed' &&
    candidate.expression.trim() !== '' && candidate.meaning.trim() !== '' &&
    candidate.exampleParseStatus !== 'needs-review');
}

export interface AutomaticExportResult {
  exportable: Candidate[];
  rejected: Array<{ candidate: Candidate; reasons: string[] }>;
}

export function validateForAutomaticExport(candidates: Candidate[]): AutomaticExportResult {
  const exportable: Candidate[] = [];
  const rejected: AutomaticExportResult['rejected'] = [];
  for (const candidate of candidates) {
    const reasons: string[] = [];
    if (!candidate.expression.trim()) reasons.push('缺少日文词条');
    if (!candidate.reading.trim()) reasons.push('缺少词条假名');
    if (!candidate.meaning.trim()) reasons.push('缺少中文释义');
    if (!candidate.example.trim()) reasons.push('缺少日文例句');
    if (!candidate.exampleReading?.trim()) reasons.push('缺少例句假名读音');
    if (!candidate.exampleMeaning?.trim()) reasons.push('缺少例句中文译文');
    if (candidate.exampleParseStatus !== 'parsed' && !reasons.length) reasons.push('例句格式无法确定');
    if (reasons.length) rejected.push({ candidate, reasons });
    else exportable.push({ ...candidate, status: 'confirmed' });
  }
  return { exportable, rejected };
}
