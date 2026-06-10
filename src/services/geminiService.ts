import { GoogleGenerativeAI } from '@google/generative-ai';

type Language = 'japanese' | 'english';

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

export type WordPair = WordPairJapanese | WordPairEnglish;

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
