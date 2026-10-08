export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
] as const;

export type GeminiModelId = typeof GEMINI_MODELS[number]['id'];
export const DEFAULT_GEMINI_MODEL: GeminiModelId = 'gemini-3.8-flash';
const STORAGE_KEY = 'vocabulary-gemini-model';

export function loadModelSelection(storage?: Pick<Storage, 'getItem'>): GeminiModelId {
  if (!storage) return DEFAULT_GEMINI_MODEL;
  try {
    const saved = storage.getItem(STORAGE_KEY);
    const match = GEMINI_MODELS.find(option => option.id === saved);
    return match?.id ?? DEFAULT_GEMINI_MODEL;
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

export function saveModelSelection(storage: Pick<Storage, 'setItem'>, model: GeminiModelId): void {
  try {
    storage.setItem(STORAGE_KEY, model);
  } catch {
    // Private browsing or disabled storage should not block a one-time selection.
  }
}
