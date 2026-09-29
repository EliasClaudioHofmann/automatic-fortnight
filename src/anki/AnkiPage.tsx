import { useRef, useState, type DragEvent } from 'react';
import { parseDocxHtml, parseTxtTable, type Candidate } from './candidate';
import { readSource } from './source';
import { buildApkgBlob, buildExportSnapshot, candidatesForExportSnapshot, createApkgFilename } from './exporter';
import { buildDeckCards } from './deck';

// Isolated Anki acceptance passed; this opens the local source gate only, not any deployed site.
const APKG_IMPORT_VERIFIED = true;

type Stage = 'input' | 'processing' | 'result';

export default function AnkiPage({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<Stage>('input');
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState('');
  const [rejectedRows, setRejectedRows] = useState<Array<{ candidate: Candidate; reasons: string[] }>>([]);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const jobId = useRef(0);

  const downloadBlob = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  };

  const processFile = async (next: File) => {
    const thisJob = ++jobId.current;
    setFile(next);
    const name = next.name.replace(/\.(docx|txt)$/i, '').trim() || '日语词汇复习';
    setDeckName(name);
    setStage('processing');
    setCandidates([]);
    setRejectedRows([]);
    setGeneratedBlob(null);
    setExportFeedback('');
    setError('');
    try {
      const source = await readSource(next);
      const parsed = source.kind === 'docx' ? parseDocxHtml(source.html) : parseTxtTable(source.text);
      const snapshot = buildExportSnapshot(parsed, name);
      const exportable = candidatesForExportSnapshot(snapshot, parsed);
      if (thisJob !== jobId.current) return;
      setCandidates(exportable);
      setRejectedRows(snapshot.rejected);
      if (!exportable.length) {
        setError('没有符合三模板要求的完整词条；未生成空牌组。请检查文件表格列和被跳过行的原因。');
        setStage('result');
        return;
      }
      if (!APKG_IMPORT_VERIFIED && !import.meta.env.DEV) {
        setError('自动解析和筛选已完成，但生产 APKG 下载受验收门禁保护；请使用已完成隔离验证的版本。');
        setStage('result');
        return;
      }
      const blob = await buildApkgBlob(exportable, name);
      if (thisJob !== jobId.current) return;
      setGeneratedBlob(blob);
      setStage('result');
      try {
        downloadBlob(blob, createApkgFilename(name));
        setExportFeedback('APKG 已生成，并已尝试自动触发下载。若浏览器没有开始下载，可点击“重新下载 APKG”。');
      } catch (cause) {
        setExportFeedback(`APKG 已生成，但浏览器未能启动自动下载：${cause instanceof Error ? cause.message : '未知原因'}。可点击“重新下载 APKG”。`);
      }
    } catch (cause) {
      if (thisJob !== jobId.current) return;
      setError(cause instanceof Error ? cause.message : '读取或生成失败；可重新选择文件重试。');
      setStage('result');
    }
  };

  const selectFile = (next?: File) => {
    if (!next) return;
    if (!/\.(docx|txt)$/i.test(next.name)) {
      setError('请选择从 Google Docs 导出的 DOCX 或 TXT 文件');
      return;
    }
    void processFile(next);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    selectFile(event.dataTransfer.files[0]);
  };
  const cards = buildDeckCards(candidates);
  const retryDownload = () => {
    if (!generatedBlob || exporting) return;
    setExporting(true);
    try {
      downloadBlob(generatedBlob, createApkgFilename(deckName));
      setExportFeedback('已再次触发下载；请检查浏览器下载列表。');
    } catch (cause) {
      setExportFeedback(`下载未能启动：${cause instanceof Error ? cause.message : '未知原因'}`);
    } finally {
      setExporting(false);
    }
  };

  return <main className="max-w-5xl mx-auto mt-8 px-4 pb-12 text-gray-800">
    <div className="flex justify-between items-center gap-3 mb-6">
      <h1 className="text-2xl font-bold">Anki 牌组自动生成</h1>
      <button className="px-3 py-2 rounded bg-gray-200" onClick={onBack}>返回原工具</button>
    </div>
    <p className="mb-4 text-sm text-gray-600">DOCX 支持词汇表格；TXT 仅支持含 Kana、Kanji、中文意思、Example 表头且以制表符分列的 TSV 式结构，普通自然语言 TXT 不支持。符合格式时浏览器会在本地校验并生成三模板 APKG。</p>
    {stage === 'input' && <section className="max-w-lg">
      <label onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}>
        <span>点击选择或拖入 DOCX 或 TSV 式 TXT 文件</span>
        <input className="sr-only" type="file" accept=".docx,.txt" onChange={event => selectFile(event.target.files?.[0])} />
      </label>
      {file && <p className="mt-3">已选择：{file.name}</p>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </section>}
    {stage === 'processing' && <p role="status">正在本地读取、校验并生成三模板牌组…</p>}
    {stage === 'result' && <>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <span>自动纳入 {candidates.length} 条 · 跳过 {rejectedRows.length} 条 · 生成卡片 {cards.length} 张</span>
        <button className="px-3 py-2 rounded bg-gray-200" onClick={() => { jobId.current++; setCandidates([]); setRejectedRows([]); setGeneratedBlob(null); setFile(null); setError(''); setStage('input'); }}>重新选择</button>
      </div>
      {error && <p role="alert" className="mb-4 text-red-800 bg-red-50 p-3 rounded">{error}</p>}
      {generatedBlob && <section className="flex flex-wrap items-center gap-3 mb-6 border rounded-lg bg-green-50 p-4">
        <strong>APKG 已在本地生成：{createApkgFilename(deckName)}</strong>
        <button disabled={exporting} onClick={retryDownload} className="px-4 py-2 rounded bg-blue-700 text-white disabled:bg-gray-300">{exporting ? '正在下载…' : '重新下载 APKG'}</button>
        {exportFeedback && <p role="status" className="w-full text-sm text-gray-700">{exportFeedback}</p>}
      </section>}
      {rejectedRows.length > 0 && <section className="mb-6 rounded-lg bg-amber-50 p-4">
        <h2 className="font-semibold">已跳过 {rejectedRows.length} 条（未猜测或补造内容）</h2>
        <ul className="mt-2 space-y-1 text-sm">{rejectedRows.map(({ candidate, reasons }) =>
          <li key={candidate.id}>源行 {candidate.sourceLine}：{reasons.join('；')}</li>)}</ul>
      </section>}
      {candidates.length === 0 && !error && <p>没有可生成的词条；未创建空牌组。</p>}
      <h2 className="text-xl font-semibold mt-8 mb-3">三种卡片预览（每个合格词条 3 张）</h2>
      <p className="text-sm text-gray-600 mb-3">例句正面只显示日文句子与句子读音；例句中文译文放在背面。</p>
      <div className="grid lg:grid-cols-2 gap-3">
        {cards.map(card => <article key={`${card.candidateId}-${card.template}`} className="border rounded-lg p-4 bg-white">
          <div className="font-semibold mb-3">模板 {card.template} · {card.template === 'A' ? '例句＋词条读音 → 中文' : card.template === 'B' ? '汉字＋例句 → 中文＋读音' : '单词 → 中文＋例句＋读音'}</div>
          <div className="text-xs text-gray-500 mb-1">正面</div><div className="border rounded p-3 min-h-12" dangerouslySetInnerHTML={{ __html: card.frontHtml }} />
          <div className="text-xs text-gray-500 mt-3 mb-1">背面</div><div className="border rounded p-3 min-h-12" dangerouslySetInnerHTML={{ __html: card.backHtml }} />
        </article>)}
      </div>
    </>}
  </main>;
}
