import { useState, useRef, useCallback, type DragEvent } from 'react';
import { pdfToImages } from './services/pdfService';
import { extractTextFromFile } from './services/documentService';
import { extractWords, extractWordsFromDocument, extractWordsFromText, type WordPair } from './services/geminiService';
import { isSupportedFile } from './services/fileImport';
import { generateHtml } from './utils/htmlGenerator';
import { generateDocx } from './utils/docxGenerator';
import { generateMarkdown } from './utils/markdownGenerator';
import { segmentFurigana } from './utils/furigana';
import pkg from '../package.json';
import AnkiPage from './anki/AnkiPage';

const VERSION = pkg.version;
type Step = 'input' | 'processing' | 'result';
type Language = 'japanese' | 'english' | 'document';

export default function App() {
  const [ankiMode, setAnkiMode] = useState(false);
  const [step, setStep] = useState<Step>('input');
  const [apiKey, setApiKey] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<Language>('japanese');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [wordPairs, setWordPairs] = useState<WordPair[]>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ──
  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const selected = Array.from(newFiles);
    const validFiles = selected.filter((file) => isSupportedFile(language, file.name));
    if (validFiles.length) setFiles((prev) => [...prev, ...validFiles]);
    setError(selected.length !== validFiles.length
      ? `已跳过 ${selected.length - validFiles.length} 个不支持的文件；${language === 'document' ? '请选择 PDF、DOCX 或 MD' : '请选择 PDF 或 MD'}。`
      : '');
  }, [language]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);

  // ── Conversion ──
  const startConversion = async () => {
    if (!apiKey.trim()) {
      setError('请填写 Gemini API Key');
      return;
    }
    if (files.length === 0) {
      setError(language === 'document'
        ? '请至少选择一个 PDF、DOCX 或 MD 文件'
        : '请选择至少一个 PDF 或 MD 文件');
      return;
    }

    setError('');
    setStep('processing');
    setStatus('正在处理中，请稍候... (Processing, please wait...)');

    try {
      // ── Document mode: text extraction + Gemini text API ──
      if (language === 'document') {
        setStatus('正在提取文档文本... (Extracting text from documents...)');
        const textParts: string[] = [];
        const failures: string[] = [];
        for (let i = 0; i < files.length; i++) {
          setStatus(`正在提取第 ${i + 1}/${files.length} 个文件... (Extracting file ${i + 1}/${files.length}...)`);
          try {
            const text = await extractTextFromFile(files[i]);
            if (text.trim()) textParts.push(text);
            else failures.push(`${files[i].name}（空文件或无可读文字）`);
          } catch (cause) {
            failures.push(`${files[i].name}（${cause instanceof Error ? cause.message : '读取失败'}）`);
          }
        }

        if (textParts.length === 0) {
          throw new Error(`未能从文件中提取到文本内容。${failures.join('；')}`);
        }

        const fullText = textParts.join('\n\n---\n\n');

        setStatus('正在使用 Gemini 分析文本... (Analyzing text with Gemini...)');
        setProgress({ current: 0, total: 1 });

        const pairs = await extractWordsFromDocument(apiKey, fullText);

        setWordPairs(pairs);
        setProgress({ current: 1, total: 1 });
        setStatus(failures.length ? `处理完成；以下文件未导入：${failures.join('；')}` : '处理完成！(Done!)');
        setStep('result');
        return;
      }

      // ── Japanese / English: PDFs use Vision; Markdown uses the same language prompt as text. ──
      const allPairs: WordPair[] = [];
      const failures: string[] = [];
      setProgress({ current: 0, total: files.length });
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          let pairs: WordPair[];
          if (file.name.toLowerCase().endsWith('.md')) {
            setStatus(`正在读取 Markdown：${file.name} (${i + 1}/${files.length})`);
            pairs = await extractWordsFromText(apiKey, await file.text(), language);
          } else {
            setStatus(`正在读取 PDF：${file.name} (${i + 1}/${files.length})`);
            const images = await pdfToImages(file);
            pairs = await extractWords(apiKey, images, language, (page, total) => {
              setStatus(`正在处理 ${file.name} 第 ${page}/${total} 页...`);
            });
          }
          if (pairs.length) allPairs.push(...pairs);
          else failures.push(`${file.name}（未识别到词汇）`);
        } catch (cause) {
          failures.push(`${file.name}（${cause instanceof Error ? cause.message : '处理失败'}）`);
        }
        setProgress({ current: i + 1, total: files.length });
      }
      if (!allPairs.length) throw new Error(`未能从文件中提取词汇。${failures.join('；')}`);
      setWordPairs(allPairs);
      setStatus(failures.length ? `处理完成；以下文件未导入：${failures.join('；')}` : '处理完成！(Done!)');
      setStep('result');
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus('发生错误 (Error occurred)');
      setStep('input');
    }
  };

  // ── Download ──
  const fileNameBase = files.length === 1
    ? files[0].name.replace(/\.(pdf|docx|md)$/i, '')
    : (language === 'document'
        ? '日语单词表_文档'
        : `${language === 'japanese' ? '日语' : '英语'}_单词表`);

  const downloadHtml = () => {
    const html = generateHtml(wordPairs);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileNameBase}_转换结果.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMarkdown = () => {
    const markdown = generateMarkdown(wordPairs, language);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileNameBase}_转换结果.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDocx = async () => {
    try {
      setStatus('正在生成 Word 文档... (Generating Word document...)');
      const blob = await generateDocx(wordPairs, language, fileNameBase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileNameBase}_转换结果.docx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('处理完成！(Done!)');
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  // ── Reset ──
  const reset = () => {
    setStep('input');
    setFiles([]);
    setLanguage('japanese');
    setStatus('');
    setProgress({ current: 0, total: 0 });
    setWordPairs([]);
    setError('');
  };

  // ── INPUT STEP ──
  if (ankiMode) return <AnkiPage onBack={() => setAnkiMode(false)} />;

  if (step === 'input') {
    return (
      <div className="max-w-lg mx-auto mt-16 px-4">
        <button onClick={() => setAnkiMode(true)} className="mb-5 w-full rounded-lg bg-indigo-600 text-white font-semibold py-3">上传文档后自动生成 Anki 牌组（三种卡片）</button>
        {/* Header */}
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-8">
          PDF 单词表转换工具
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
        </h1>

        <a href="/n2-japanese-grammar-notes.html" target="_blank" rel="noreferrer" className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100">
          📘 N2 语法复习笔记
        </a>

        <a href="/n2-grammar-map.html" target="_blank" rel="noreferrer" className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100">
          🗺️ N2 语法整书记忆地图
        </a>

        <a href="/n2-grammar-frequency.html" target="_blank" rel="noreferrer" className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 transition hover:bg-amber-100">
          📊 N2 真题语法候选频次（审计版）
        </a>

        {/* API Key */}
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gemini API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="输入你的 Gemini API Key..."
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition mb-6"
        />

        {/* Language Selection */}
        <label className="block text-sm font-medium text-gray-700 mb-2">
          选择语言 (Choose Language)
        </label>
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setLanguage('japanese'); setFiles(prev => prev.filter(file => isSupportedFile('japanese', file.name))); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
              language === 'japanese'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            日语 (Japanese)
          </button>
          <button
            onClick={() => { setLanguage('english'); setFiles(prev => prev.filter(file => isSupportedFile('english', file.name))); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
              language === 'english'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            英语 (English)
          </button>
          <button
            onClick={() => { setLanguage('document'); setError(''); }}
            className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
              language === 'document'
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            文档上传 (Document)
          </button>
        </div>

        {/* File Drop Zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
        >
          <p className="text-4xl mb-3">{language === 'document' ? '📄📝' : '📄'}</p>
          <p className="text-gray-600 font-medium">
            {language === 'document'
              ? '点击选择或拖拽 PDF / Word / Markdown 文件到此处'
              : '点击选择或拖拽 PDF / Markdown 文件到此处'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {language === 'document'
              ? '支持 .pdf、.docx 和 .md 文件'
              : '支持 .pdf 和 .md 文件，可同时选择多个'}
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={language === 'document' ? '.pdf,.docx,.md' : '.pdf,.md'}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files ?? [])}
        />

        {/* File List */}
        {files.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">
              已选择 {files.length} 个文件 ({files.length} file{files.length > 1 ? 's' : ''} selected)
            </p>
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-sm"
                >
                  <span className="text-gray-700 truncate">📄 {f.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="ml-2 px-2 py-1 text-red-600 hover:bg-red-50 rounded transition text-xs"
                  >
                    ✕ 删除
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Convert Button */}
        <button
          onClick={startConversion}
          disabled={!apiKey.trim() || files.length === 0}
          className={`w-full mt-6 py-3 rounded-lg font-bold text-white text-base transition ${
            apiKey.trim() && files.length > 0
              ? 'bg-green-600 hover:bg-green-700 active:scale-[0.98] cursor-pointer'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          开始转换 (Start Conversion)
        </button>
      </div>
    );
  }

  // ── PROCESSING STEP ──
  if (step === 'processing') {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
      <div className="max-w-lg mx-auto mt-16 px-4 text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">
          PDF 单词表转换工具
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
        </h1>

        {/* Spinner */}
        <div className="inline-block w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />

        <p className="text-gray-700 font-medium">{status}</p>

        {/* Progress bar */}
        {progress.total > 0 && (
          <div className="mt-6">
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {progress.current} / {progress.total} {language === 'document' ? '步' : '文件'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── RESULT STEP ──
  return (
    <div className="max-w-5xl mx-auto mt-8 px-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          PDF 单词表转换工具
          <span className="text-xs text-gray-400 ml-2 align-top">v{VERSION}</span>
        </h1>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            onClick={downloadHtml}
            className="px-5 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 active:scale-[0.98] transition"
          >
            ⬇ 下载 HTML
          </button>
          <button
            onClick={downloadMarkdown}
            className="px-5 py-2.5 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 active:scale-[0.98] transition"
          >
            ⬇ 下载 Markdown
          </button>
          <button
            onClick={downloadDocx}
            className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 active:scale-[0.98] transition"
          >
            📄 下载 Word
          </button>
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition"
          >
            重新转换 (New)
          </button>
        </div>
      </div>

      {/* Status + count */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1 text-sm">
          ✅ {status}
        </span>
        <span className="text-gray-500 text-sm">
          共提取 {wordPairs.length} 个单词对
        </span>
      </div>

      {/* Table preview — EXACT same styles as original */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="result-table">
            <thead>
              <tr>
                {language === 'document' ? (
                  <>
                    <th>日文假名 (Kana)</th>
                    <th>中文默写</th>
                    <th>日文默写</th>
                    <th>日汉字 (Kanji)</th>
                    <th>英文翻译 (English)</th>
                    <th>例句 (Example)</th>
                    <th>中文意思 (Chinese)</th>
                  </>
                ) : (
                  <>
                    <th>{language === 'japanese' ? '日语 (Japanese)' : '英语 (English)'}</th>
                    <th>中文 (Chinese)</th>
                    <th>默写/挖空 (Practice)</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {wordPairs.map((item, i) => {
                let foreignContent: React.ReactNode;
                
                if ('type' in item && item.type === 'document') {
                  // Document mode: show kana and kanji in separate cells
                  foreignContent = null; // not used directly — handled inline below
                } else if ('ja' in item) {
                  // Japanese with furigana
                  foreignContent = segmentFurigana(item.ja, item.reading).map((seg, si) =>
                    seg.reading ? (
                      <ruby key={si}>
                        {seg.text}<rt>{seg.reading}</rt>
                      </ruby>
                    ) : (
                      <span key={si}>{seg.text}</span>
                    )
                  );
                } else {
                  // English
                  foreignContent = <span>{item.en}</span>;
                }
                
                // Document mode: seven columns, including separate Chinese/Japanese practice areas.
                if ('type' in item && item.type === 'document') {
                  return (
                    <tr key={i}>
                      <td>{item.kana}</td>
                      <td className="blank">__________________</td>
                      <td className="blank">__________________</td>
                      <td>{item.kanji || <span style={{color: '#999'}}>—</span>}</td>
                      <td>{item.en || ''}</td>
                      <td>{item.example || <span style={{color: '#999'}}>—</span>}</td>
                      <td>{item.cn}</td>
                    </tr>
                  );
                }
                
                return (
                  <tr key={i}>
                    <td>{foreignContent}</td>
                    <td>{item.cn}</td>
                    <td className="blank">__________________</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
