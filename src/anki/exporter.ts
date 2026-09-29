import { confirmedCards, validateForAutomaticExport, type Candidate } from './candidate.ts';
import { completeTemplateCards } from './apkgCards.ts';
import {
  buildDeckCards,
  buildNoteFields,
  CARD_TEMPLATE_SPECS,
  NOTE_FIELD_NAMES,
  NOTE_FIELD_REQUIREMENTS,
} from './deck.ts';

export interface NoteRecord {
  candidateId: string;
  guid: string;
  expression: string;
  fields: string[];
  cardOrdinals: number[];
}

export interface ExportSnapshot {
  records: NoteRecord[];
  cards: ReturnType<typeof buildDeckCards>;
  rejected: Array<{ candidate: Candidate; reasons: string[] }>;
}

export function candidatesForExportSnapshot(
  snapshot: Pick<ExportSnapshot, 'records'>,
  candidates: Candidate[],
): Candidate[] {
  const candidatesById = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const rows = candidatesById.get(candidate.id) ?? [];
    rows.push(candidate);
    candidatesById.set(candidate.id, rows);
  }
  const recordIds = new Set<string>();
  const matched: Candidate[] = [];
  for (const record of snapshot.records) {
    if (recordIds.has(record.candidateId)) continue;
    recordIds.add(record.candidateId);
    const rows = candidatesById.get(record.candidateId);
    if (rows?.length === 1) matched.push({ ...rows[0], status: 'confirmed' });
  }
  return confirmedCards(validateForAutomaticExport(matched).exportable);
}

function normalizeDeckName(deckName: string): string {
  return deckName.normalize('NFC').trim() || '日语词汇复习';
}

export function stableApkgIds(deckName: string): { modelId: number; deckId: number } {
  const normalizedName = normalizeDeckName(deckName);
  const modelId = 1_700_000_000_001;
  const deckId = Number(2_000_000_000_000n + (hash64(`deck-v1\u0000${normalizedName}`) & ((1n << 52n) - 1n)));
  if (!Number.isSafeInteger(modelId) || !Number.isSafeInteger(deckId)) {
    throw new Error('APKG 构建失败：稳定牌组 ID 超出安全整数范围');
  }
  return { modelId, deckId };
}

export function buildExportSnapshot(candidates: Candidate[], deckName = '日语词汇复习'): ExportSnapshot {
  const name = normalizeDeckName(deckName);
  const validation = validateForAutomaticExport(candidates);
  const keyCounts = new Map<string, number>();
  for (const candidate of validation.exportable) {
    const key = JSON.stringify([name, candidate.expression.normalize('NFC').trim(), candidate.reading.normalize('NFC').trim()]);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const duplicated = new Set([...keyCounts].filter(([, count]) => count > 1).map(([key]) => key));
  const duplicateCandidates = validation.exportable.filter(candidate =>
    duplicated.has(JSON.stringify([name, candidate.expression.normalize('NFC').trim(), candidate.reading.normalize('NFC').trim()])));
  const duplicateCandidateSet = new Set(duplicateCandidates);
  const exportable = validation.exportable.filter(candidate => !duplicateCandidateSet.has(candidate));
  const duplicateReason = '同来源、同词形和同假名的重复键；为避免多义词条静默合并，未导出';
  const rejected = [
    ...validation.rejected,
    ...duplicateCandidates.map(candidate => ({ candidate, reasons: [duplicateReason] })),
  ].sort((left, right) => left.candidate.sourceLine - right.candidate.sourceLine);
  const records = exportable.map(candidate => ({
    candidateId: candidate.id,
    guid: noteGuid(name, candidate.expression, candidate.reading),
    expression: candidate.expression.trim(),
    fields: buildNoteFields(candidate),
    cardOrdinals: [0, 1, 2],
  }));
  const cards = buildDeckCards(exportable);
  if (cards.length !== records.reduce((sum, record) => sum + record.cardOrdinals.length, 0)) {
    throw new Error('APKG 构建失败：预览与导出卡片数量不一致');
  }
  return { records, cards, rejected };
}

export function buildNoteRecords(candidates: Candidate[]): NoteRecord[] {
  return buildExportSnapshot(candidates).records;
}

export function createApkgFilename(deckName: string): string {
  const base = deckName.normalize('NFC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return `${base || 'anki-deck'}.apkg`;
}

function hash64(value: string): bigint {
  const bytes = new TextEncoder().encode(value.normalize('NFC'));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

export function noteModForExport(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  guid: string,
  fields: string[],
  nowSeconds: number,
): number {
  const key = `anki-note-mod-v1:${guid}`;
  const fingerprint = hash64(JSON.stringify(fields)).toString(16);
  let stored: string | null;
  try {
    stored = storage.getItem(key);
  } catch {
    throw new Error('Anki 导出失败：本地更新缓存读取失败。请检查当前浏览器的站点存储权限和可用空间后重试；不要切换浏览器或清除站点数据后依赖短时间重导更新。');
  }

  let previous: { fingerprint: string; mod: number } | undefined;
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (
        typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
        !('fingerprint' in parsed) || typeof parsed.fingerprint !== 'string' ||
        !/^[0-9a-f]{1,16}$/.test(parsed.fingerprint) ||
        !('mod' in parsed) || typeof parsed.mod !== 'number' || !Number.isSafeInteger(parsed.mod) || parsed.mod < 0
      ) throw new Error('invalid cache');
      previous = parsed as { fingerprint: string; mod: number };
    } catch {
      throw new Error(`Anki 导出失败：本地更新缓存无效或已损坏。请清除该词条缓存项“${key}”后重试；清除站点数据后，短时间内重导不能保证更新旧笔记。`);
    }
  }

  const mod = previous?.fingerprint === fingerprint
    ? previous.mod
    : Math.max(nowSeconds, (previous?.mod ?? 0) + 1);
  if (!Number.isSafeInteger(mod)) {
    throw new Error('Anki 导出失败：本地更新缓存时间已超出安全范围。请在 Anki 中人工处理该词条，或清除该词条缓存项后再导出。');
  }
  try {
    storage.setItem(key, JSON.stringify({ fingerprint, mod }));
  } catch {
    throw new Error('Anki 导出失败：本地更新缓存写入失败。请检查当前浏览器的站点存储权限和可用空间后重试；不要切换浏览器或清除站点数据后依赖短时间重导更新。');
  }
  return mod;
}

function noteGuid(deckName: string, expression: string, reading: string): string {
  // Neither source row position nor editable meaning/example belongs in identity.
  const key = ['anki-v2', deckName.trim(), expression.trim(), reading.trim()].join('\u0000');
  return `anki-${hash64(key).toString(16).padStart(16, '0')}`;
}

export async function buildApkgBlob(candidates: Candidate[], deckName: string): Promise<Blob> {
  const name = normalizeDeckName(deckName);
  const snapshot = buildExportSnapshot(candidates, name);
  const records = snapshot.records;
  if (records.length === 0) throw new Error('没有可导出的有效词条');

  const { modelId, deckId } = stableApkgIds(name);
  const { default: ApkgBuilder, Collection, Deck, Card, Note, Model, Field, CardTemplate } = await import('apkg-browser-builder');
  const collection = new Collection();
  const model = new Model('日语词汇三向复习', NOTE_FIELD_NAMES.map(field => new Field(field))).setId(modelId);
  model.setTemplates(CARD_TEMPLATE_SPECS.map(template =>
    new CardTemplate(template.name, template.question, template.answer)));
  model.setRequirements(NOTE_FIELD_REQUIREMENTS);
  model.setCss('.card { font-family: Arial, "Noto Sans JP", sans-serif; font-size: 20px; text-align: center; color: #222; background: #fff; } .reading, .example-reading, .example-meaning { margin-top: .6em; color: #555; } .example { margin-top: 1em; font-size: .9em; } .meaning { font-size: 1.2em; }');
  const deck = new Deck(name, '由本地审核生成；每条词条最多生成三种复习卡。').setId(deckId).setModel(model);
  collection.addDeck(deck);

  const idBase = Date.now() * 1000;
  let cardIndex = 0;
  records.forEach((record, noteIndex) => {
    const note = new Note(...record.fields)
      .setId(idBase + noteIndex * 10)
      .setGuid(record.guid)
      .setModel(model);
    const card = new Card(...record.fields)
      .setId(idBase + cardIndex + 1)
      .setOrdinal(0)
      .setNote(note);
    deck.addCard(card);
    cardIndex++;
  });

  const previewCount = snapshot.cards.length;
  // Anki derives the additional template cards from each imported note; the APKG seed contains one card row per note.
  if (cardIndex !== records.length || previewCount !== records.reduce((sum, record) => sum + record.cardOrdinals.length, 0)) {
    throw new Error('APKG 构建失败：笔记、模板卡片与预览数量不一致');
  }

  const seed = await new ApkgBuilder(collection).build();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const noteMods = new Map(records.map(record => [
    record.guid, noteModForExport(window.localStorage, record.guid, record.fields, nowSeconds),
  ]));
  const { initializeSql } = await import('./sqlRuntime.ts');
  const archive = await completeTemplateCards(seed, await initializeSql(), noteMods);
  const signature = new Uint8Array(await archive.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error('APKG 构建失败：生成内容不是有效的 ZIP 包');
  }
  return new Blob([archive], { type: 'application/zip' });
}
