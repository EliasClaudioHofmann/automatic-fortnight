import { GoogleGenerativeAI } from '@google/generative-ai';

type Language = 'japanese' | 'english' | 'document';

const PROMPTS = {
  japanese: `You are extracting words from a Japanese-Chinese vocabulary table.

CRITICAL: Your output MUST be a valid JSON array with EXACTLY these field names:
- "ja"    → the JAPANESE word to display
- "cn"    → the CHINESE translation only
- "reading" → the HIRAGANA reading of the Japanese word
- "pos"   → the part of speech shown in the table (e.g. "n.", "v.", "adj.", "adv."). Use "?" if not visible.

Many vocabulary tables write each word with the hiragana reading FIRST, followed by the kanji form in parentheses:
   かんじ（漢字）   (noun: hiragana reading=かんじ, kanji=漢字)
   たべる（食べる） (verb: hiragana form=たべる, dictionary kanji form=食べる)

When you see this kana(kanji) format, follow these rules:

RULE 1 — NOUNS (pos shows "n.", "名", "名词", "名詞", or the word is clearly a noun):
   "ja"     = the KANJI inside the parentheses  (e.g. "漢字")
   "reading" = the KANA before the parentheses  (e.g. "かんじ")

RULE 2 — VERBS (pos shows "v.", "動", "动词", "動詞", or the word is clearly a verb):
   "ja"     = the KANA before the parentheses  (e.g. "たべる") — keep the kana form!
   "reading" = the SAME kana value             (e.g. "たべる")

RULE 3 — Adjective / Other / Unknown POS:
   Treat like a noun: extract the kanji from parentheses as "ja", use the leading kana as "reading".

RULE 4 — Normal words without kana(kanji) format (e.g. "日本語"):
   "ja"     = the word itself
   "reading" = its hiragana reading from the table or your knowledge

Examples:

Table row: "かんじ（漢字） | n. | 汉字"
Output:   {"ja": "漢字", "cn": "汉字", "reading": "かんじ", "pos": "n."}

Table row: "たべる（食べる） | v. | 吃"
Output:   {"ja": "たべる", "cn": "吃", "reading": "たべる", "pos": "v."}

Table row: "日本語 | n. | にほんご | 日语"
Output:   {"ja": "日本語", "cn": "日语", "reading": "にほんご", "pos": "n."}

Table row: "あたらしい（新しい） | adj. | 新的"
Output:   {"ja": "新しい", "cn": "新的", "reading": "あたらしい", "pos": "adj."}

WRONG outputs (never do these):
- {"ja": "n.", "cn": "日本語"}                    ← POS value in ja field
- {"cn": "日本語", "ja": "日语"}                  ← ja/cn swapped
- {"ja": "かんじ（漢字）", ...}                    ← raw kana(kanji) string left in ja
- {"ja": "漢字", "reading": "漢字"}               ← kanji repeated as reading

Return ONLY a JSON array. No markdown, no explanation, no extra text.`,
  
  english: `You are extracting words from an English-Chinese vocabulary table.

CRITICAL: Your output MUST be valid JSON array with EXACTLY these field names:
- "en" → the ENGLISH word/phrase only
- "cn" → the CHINESE translation only

The table may have columns like: English | POS | Chinese, or similar.
Extract ONLY the English word and its Chinese meaning. SKIP the POS (part-of-speech) column.

Example table row: "check-up | n. | 检查,体检"
Correct output: {"en": "check-up", "cn": "检查,体检"}

WRONG outputs (do NOT do this):
- {"en": "n.", "cn": "check-up"} ← wrong field values
- {"cn": "check-up", "en": "检查,体检"} ← swapped values

Return ONLY a JSON array. No markdown, no explanation. Example:
[{"en": "comprehensive", "cn": "全面的,综合的"}]`,

  document: `You are extracting Japanese words from a document. The document contains Japanese text — it may be a vocabulary list (with or without Chinese translations), a textbook excerpt, or any document with Japanese words.

CRITICAL: Your output MUST be a valid JSON array with EXACTLY these field names:
- "kana"    → the HIRAGANA reading of the word (how it's pronounced). REQUIRED for every word.
- "kanji"   → the KANJI form of the word. If the word has no kanji form (pure kana word), set this to an empty string "".
- "cn"      → the CHINESE translation/meaning of the word. See the TRANSLATION RULES below.
- "example" → the phrase or example sentence using the word. See the EXAMPLE RULES below.

─── TRANSLATION RULES (for the "cn" field) ───

The document may contain Chinese translations for SOME words but not others — even within the same page. You MUST judge PER WORD:

• If the document shows a Chinese meaning next to / paired with THIS specific Japanese word → USE that existing translation. Copy it as-is.
• If THIS specific Japanese word has NO Chinese translation near it → GENERATE an accurate Chinese translation yourself.

Do NOT assume the whole document is uniform — check each word individually. A vocabulary table might have translations for the first few words but then switch to Japanese-only format, or vice versa.

Signs that a nearby Chinese phrase IS a translation (use it):
- It appears in the same row/line as the Japanese word in a table-like layout
- It follows the Japanese word after a separator like "|", "：", ":", "—", tab, or space
- It's in a column labeled "中文", "汉语", "释义", "意味", etc.

Signs that a nearby Chinese phrase is NOT a translation (generate your own):
- It's clearly part of the Japanese sentence itself (e.g. kanji that also appear in Chinese)
- It has no structural pairing with the Japanese word
- The document is continuous prose, not a word list

When GENERATING translations:
- Provide concise, dictionary-style Chinese equivalents.
- For words with multiple meanings, give the most common/fitting one based on context.
- Use simplified Chinese (简体中文).
- CRITICAL: The "cn" field MUST contain only valid Chinese characters. It MUST NOT contain any Japanese Hiragana or Katakana (e.g., "显示", "移动" are correct Chinese translations, while "示す", "动かす" are WRONG because they contain Japanese kana 'す' and 'かす').
- CRITICAL: For Japanese Kanji words that look identical to Chinese (like 通学, 用, 方, 案), do NOT just copy them directly into the "cn" field. Provide their actual Chinese meaning in context (e.g., 通学 -> 上学, 用 -> 用途/使用, 案 -> 草案/方案).

─── EXAMPLE RULES (for the "example" field) ───

- Check if there is an existing phrase or example sentence containing or associated with the Japanese word in the document (e.g., in the next line, right after the word, or in parentheses). If so, extract it.
- You MUST format the "example" field to ALWAYS include both the hiragana reading/pronunciation of the sentence and its Chinese translation in parentheses. The format must be exactly:
  \`[Japanese sentence/phrase]（[Hiragana pronunciation/reading]）（[Chinese translation]）\`
- If no phrase or example sentence exists in the document, you MUST generate a simple Japanese phrase or short example sentence using the word, and format it exactly the same way.
- CRITICAL: The extracted or generated example/phrase MUST use the word with the EXACT same reading (pronunciation) and meaning as defined in the "kana" and "cn" fields. For words with multiple readings (homographs/polyphones) or multiple meanings, ensure the example reflects the specific reading in this entry.
  For example:
  * If the word is "方" with reading "ほう" and meaning "方向/方面", the example MUST be read as "ほう" (e.g., "あっちの方（あっちのほう）（那个方向）"), NOT read as "かた" (e.g., do NOT use "やり方（やりかた）").
  * If the word is "行" with reading "ぎょう" and meaning "行", the example MUST be read as "ぎょう" (e.g., "一行目（いちぎょうめ）（第一行）"), NOT read as "い" (e.g., do NOT use "行く（いく）").
- Keep the generated examples natural, simple, and helpful for language learners.

─── EXTRACTION RULES ───

1. Extract EVERY Japanese word found in the document — nouns, verbs, adjectives, adverbs, particles (if they appear as vocabulary items).
2. If the word appears written in kanji, put the kanji in "kanji" and generate the hiragana reading in "kana".
3. If the word appears only in kana (hiragana/katakana), put that kana in "kana" and set "kanji" to "".
4. If the document shows both forms (e.g. "漢字（かんじ）" or "かんじ（漢字）"), extract both: "kanji"="漢字", "kana"="かんじ".
5. For verbs: the "kanji" field should contain the dictionary form. For example, if you see "食べる", set kanji="食べる" and kana="たべる".
6. For katakana words (loanwords), set kana to the katakana form and kanji to "".

Example output:
[
  {"kana": "かんじ", "kanji": "漢字", "cn": "汉字", "example": "漢字の練習（かんじのれんしゅう）（练习汉字）"},
  {"kana": "たべる", "kanji": "食べる", "cn": "吃", "example": "ご飯を食べる（ごはんをたべる）（吃饭）"},
  {"kana": "コンピューター", "kanji": "", "cn": "电脑", "example": "新しいコンピューター（あたらしいこんぴゅーたー）（新电脑）"},
  {"kana": "あたらしい", "kanji": "新しい", "cn": "新的", "example": "新しい本を買う（あたらしいほんをかう）（买新书）"}
]

WRONG outputs (never do these):
- {"kana": "漢字", ...} ← kanji in kana field
- {"kanji": "かんじ", ...} ← kana in kanji field
- Missing "kana" field ← REQUIRED
- Missing "kanji" field ← REQUIRED (use "" if no kanji)
- Leaving "cn" empty ← REQUIRED, always provide a Chinese translation
- Putting Japanese kana (like す, かす, or any Hiragana/Katakana) in the "cn" field
- Blindly copying the Japanese kanji word to the "cn" field without providing its actual Chinese meaning (e.g., copying "通学" directly to "cn" is wrong; translate it to "上学")
- Missing "example" field ← REQUIRED (always provide an example sentence)
- Format of example field not matching \`[Japanese]（[Hiragana]）（[Chinese]）\`

Return ONLY a JSON array. No markdown, no explanation, no extra text.`,
};

// ── Regex patterns for kana(kanji) detection (post-processing safety net) ──
const KANA_RE = /[぀-ゟ゠-ヿ]/;
const KANJI_RE = /[一-龯㐀-䶿]/;
// Matches "kana（kanji-mix）" or "kana(kanji-mix)" — full-width or half-width parens
const KANA_PAREN_PATTERN = /^([぀-ゟ゠-ヿ]+)\s*[（(]\s*([^）)]+)\s*[）)]$/;

/** Return true when the POS string indicates a verb. */
function posIsVerb(pos: string | undefined): boolean {
  if (!pos) return false;
  const p = pos.trim().toLowerCase();
  return /^(v\.?|verb|動(詞|词)?|動\.)$/i.test(p);
}

/** Return true when the POS string explicitly indicates a noun. */
function posIsNoun(pos: string | undefined): boolean {
  if (!pos) return false;
  const p = pos.trim().toLowerCase();
  return /^(n\.?|noun|名(詞|词)?|名\.)$/i.test(p);
}

/**
 * Fallback heuristic: does the parenthesized content look like a verb?
 * Verb dictionary forms contain okurigana (kanji + trailing kana),
 * while noun kanji forms in parentheses are typically all-kanji.
 */
function isLikelyVerb(text: string): boolean {
  return KANA_RE.test(text);
}

/**
 * Post-process a single Japanese word pair to handle the kana(kanji) format.
 * - If `ja` still contains raw "kana（kanji）", extract and reassign.
 * - If `ja` is pure kana but `reading` contains kanji, swap them.
 * - Otherwise return the pair unchanged.
 */
function postProcessJapanesePair(pair: WordPairJapanese): WordPairJapanese {
  let { ja, reading, pos } = pair;

  // ── Case 1: Detect raw kana(kanji) in ja field ──
  const match = ja.match(KANA_PAREN_PATTERN);
  if (match) {
    const kana = match[1];
    const contentInParens = match[2];

    // Determine noun vs verb, in priority order:
    // 1. Explicit POS from table (most reliable)
    // 2. Fallback heuristic on the parenthesized content
    const verb = posIsVerb(pos) || (!posIsNoun(pos) && isLikelyVerb(contentInParens));

    if (verb) {
      ja = kana;
      reading = reading || kana;
    } else {
      ja = contentInParens;
      reading = kana;
    }
  }

  // ── Case 2: Swapped fields — reading contains kanji but ja is pure kana ──
  if (reading && KANJI_RE.test(reading) && !KANJI_RE.test(ja) && !KANA_PAREN_PATTERN.test(ja)) {
    const temp = ja;
    ja = reading;
    reading = temp;
  }

  // ── Trim whitespace ──
  return {
    ...pair,
    ja: ja.trim(),
    reading: reading.trim(),
  };
}

/**
 * Post-process all Japanese pairs extracted by Gemini.
 * Safety net for cases where the prompt was not fully followed.
 */
function postProcessJapanesePairs(pairs: WordPairJapanese[]): WordPairJapanese[] {
  return pairs.map(postProcessJapanesePair);
}

export interface WordPairJapanese {
  ja: string;
  cn: string;
  reading: string;
  pos?: string;
  type: 'japanese';
}

export interface WordPairEnglish {
  en: string;
  cn: string;
  type: 'english';
}

export interface WordPairDocument {
  kana: string;
  kanji: string;
  cn: string;
  example: string;
  type: 'document';
}

export type WordPair = WordPairJapanese | WordPairEnglish | WordPairDocument;

/**
 * Extract language-specific word pairs from PDF page images using Gemini.
 * Calls onProgress(currentPage, totalPages) after each page is processed.
 */
export async function extractWords(
  apiKey: string,
  images: string[],
  language: Language,
  onProgress: (current: number, total: number) => void
): Promise<WordPair[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

  const allPairs: WordPair[] = [];
  const prompt = PROMPTS[language];

  for (let i = 0; i < images.length; i++) {
    onProgress(i + 1, images.length);

    try {
      const result = await model.generateContent([
        { inlineData: { data: images[i], mimeType: 'image/jpeg' } },
        prompt,
      ]);

      const text = result.response.text();
      
      // Try to extract JSON from response (handle cases where Gemini adds extra text)
      let jsonStr = text;
      
      // Look for JSON array pattern
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      // Remove markdown code blocks if present
      jsonStr = jsonStr
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const pairs = JSON.parse(jsonStr);
      
      // Validate and process pairs
      if (Array.isArray(pairs)) {
        if (language === 'japanese') {
          // Collect raw Japanese pairs (cast to intermediate type with optional pos)
          const rawPairs = pairs as Array<{
            ja?: unknown; cn?: unknown; reading?: unknown; pos?: unknown;
          }>;
          let japanesePairs: WordPairJapanese[] = [];
          for (const item of rawPairs) {
            if (item.ja && item.cn) {
              japanesePairs.push({
                ja: String(item.ja).trim(),
                cn: String(item.cn).trim(),
                reading: String(item.reading || '').trim(),
                pos: item.pos ? String(item.pos).trim() : undefined,
                type: 'japanese',
              });
            }
          }
          // Apply post-processing safety net for kana(kanji) format
          japanesePairs = postProcessJapanesePairs(japanesePairs);
          allPairs.push(...japanesePairs);
        } else {
          for (const item of pairs) {
            if (item.en && item.cn) {
              allPairs.push({
                en: String(item.en || '').trim(),
                cn: String(item.cn || '').trim(),
                type: 'english',
              });
            }
          }
        }
      }
    } catch (error) {
      // Log error but skip page — same behavior as original
      console.warn(`Error processing page ${i + 1}:`, error);
      continue;
    }
  }

  return allPairs;
}

/**
 * Extract Japanese word pairs from document text (PDF/Word documents) using Gemini.
 * This is a text-in, text-out API call — no image processing needed.
 * The document text is sent directly to Gemini with the document-mode prompt.
 */
export async function extractWordsFromDocument(
  apiKey: string,
  documentText: string,
): Promise<WordPairDocument[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
  const prompt = PROMPTS.document;

  // Split long documents into chunks to stay within reasonable context limits.
  // Each chunk is ~8000 chars — small enough for fast processing.
  const CHUNK_SIZE = 8000;
  const chunks: string[] = [];
  for (let i = 0; i < documentText.length; i += CHUNK_SIZE) {
    chunks.push(documentText.slice(i, i + CHUNK_SIZE));
  }

  const allPairs: WordPairDocument[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const chunkLabel = chunks.length > 1
      ? `\n\n[This is part ${ci + 1} of ${chunks.length} of the document.]`
      : '';

    try {
      const result = await model.generateContent([
        { text: chunk + chunkLabel },
        prompt,
      ]);

      const text = result.response.text();

      // Try to extract JSON from response
      let jsonStr = text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      jsonStr = jsonStr
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const pairs = JSON.parse(jsonStr);

      if (Array.isArray(pairs)) {
        for (const item of pairs) {
          if (item.kana || item.kanji) {
            allPairs.push({
              kana: String(item.kana || '').trim(),
              kanji: String(item.kanji || '').trim(),
              cn: String(item.cn || '').trim(),
              example: String(item.example || '').trim(),
              type: 'document',
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error processing document chunk ${ci + 1}:`, error);
      continue;
    }
  }

  return allPairs;
}
