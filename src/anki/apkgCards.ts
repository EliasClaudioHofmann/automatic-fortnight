import JSZip from 'jszip';
import type { SqlJsStatic } from 'sql.js';

/** The builder emits one note per card, so build its one-card seed first and expand cards in SQLite. */
export async function completeTemplateCards(archive: Blob, SQL: SqlJsStatic, noteMods?: ReadonlyMap<string, number>): Promise<Blob> {
  const zip = await JSZip.loadAsync(await archive.arrayBuffer(), { checkCRC32: true });
  const entry = zip.file('collection.anki2');
  if (!entry) throw new Error('APKG 缺少 Anki 数据库');
  const db = new SQL.Database(await entry.async('uint8array'));
  try {
    const columns = db.exec('PRAGMA table_info(cards)')[0]?.values.map(row => String(row[1])) ?? [];
    const id = columns.indexOf('id');
    const noteId = columns.indexOf('nid');
    const ordinal = columns.indexOf('ord');
    if (id < 0 || noteId < 0 || ordinal < 0) throw new Error('APKG 卡片表结构不完整');
    const seeds = db.exec('SELECT * FROM cards')[0]?.values ?? [];
    const noteCount = Number(db.exec('SELECT count(*) FROM notes')[0].values[0][0]);
    if (!noteCount || seeds.length !== noteCount || seeds.some(row => row[ordinal] !== 0) ||
        new Set(seeds.map(row => row[noteId])).size !== noteCount) {
      throw new Error('APKG 种子笔记和卡片不是一对一，停止生成');
    }
    let nextId = Math.max(...seeds.map(row => Number(row[id]))) + 1;
    db.run('BEGIN');
    if (noteMods) {
      const rows = db.exec('SELECT guid FROM notes')[0]?.values ?? [];
      if (rows.length !== noteMods.size || rows.some(([guid]) => !noteMods.has(String(guid)))) {
        throw new Error('APKG 笔记 GUID 与修改时间不匹配');
      }
      const update = db.prepare('UPDATE notes SET mod=? WHERE guid=?');
      try {
        for (const [guid, mod] of noteMods) update.run([mod, guid]);
      } finally { update.free(); }
    }
    const insert = db.prepare(`INSERT INTO cards VALUES (${columns.map(() => '?').join(',')})`);
    try {
      for (const row of seeds) {
        for (const ord of [1, 2]) {
          const values = [...row];
          values[id] = nextId++;
          values[ordinal] = ord;
          insert.run(values);
        }
      }
    } finally { insert.free(); }
    db.run('COMMIT');
    const cardCount = Number(db.exec('SELECT count(*) FROM cards')[0].values[0][0]);
    if (cardCount !== noteCount * 3 || db.exec('PRAGMA integrity_check')[0].values[0][0] !== 'ok') {
      throw new Error('APKG 三模板卡片数量或数据库完整性校验失败');
    }
    zip.file('collection.anki2', db.export());
  } finally { db.close(); }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
