/** Pure post-processing for VLM output. No I/O. */

export const DESCRIBE_PROMPT =
  'Describe what is visible in this image in one factual sentence. Describe only what can be seen: people, objects, setting, actions. Do not describe emotions, mood, atmosphere or meaning, and do not guess intentions.';

export const OCR_PROMPT =
  'Transcribe all legible text in the image exactly as written, in its original language, one item per line. If there is no legible text, answer NONE.';

export const STRICT_SUFFIX =
  ' Use only plain nouns, verbs and colours. Do not use adjectives that express judgement or feeling.';

// Mood, feeling and judgement words. A hit means the description is not observational.
const INTERPRETIVE = new RegExp(
  '\\b(' + [
    'beautiful',
    'lovely',
    'cozy',
    'cosy',
    'peaceful',
    'serene',
    'calm',
    'tranquil',
    'quiet',
    'warm',
    'inviting',
    'happy',
    'sad',
    'joy\\w*',
    'excited',
    'lonely',
    'nostalgic',
    'melanchol\\w*',
    'romantic',
    'charming',
    'stunning',
    'picturesque',
    'vibrant',
    'busy',
    'bustling',
    'relax\\w*',
    'comfort\\w*',
    'mood',
    'atmosphere',
    'ambiance',
    'feeling',
    'feels?',
    'seems?',
    'appears? to (be )?(feel|enjoy)',
    'enjoy\\w*',
    'suggest\\w*',
    'evok\\w*',
    'symbol\\w*',
    'represent\\w*',
    'intend\\w*',
    'perhaps',
    'likely',
    'probably',
    'maybe',
    'special',
    'memorable',
    'dramatic',
    'moody',
    'dreamy',
    'gloomy',
    'cheerful',
    'playful',
    'elegant',
    'magical',
  ].join('|') + ')\\b',
  'i',
);

export function interpretiveWords(text: string): string[] {
  const hits: string[] = [];
  const re = new RegExp(INTERPRETIVE.source, 'gi');
  for (const m of text.matchAll(re)) hits.push(m[0].toLowerCase());
  return hits;
}

export function cleanDescription(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Repetition loops and single-character-class noise are what small VLMs emit on text-free frames. */
export function isDegenerate(text: string): boolean {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  if ([...counts.values()].some((n) => n > 3)) return true;

  const tokens = text.split(/\s+/).filter(Boolean);
  const grams = new Map<string, number>();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const g = tokens.slice(i, i + n).join(' ');
      const c = (grams.get(g) ?? 0) + 1;
      grams.set(g, c);
      if (c > 3 && g.length >= 2) return true;
    }
  }

  const chars = [...text.replace(/\s/g, '')];
  if (chars.length >= 8) {
    const freq = new Map<string, number>();
    for (const ch of chars) freq.set(ch, (freq.get(ch) ?? 0) + 1);
    if (Math.max(...freq.values()) / chars.length > 0.6) return true;
  }
  return false;
}

/** Returns the transcription, or null for "no text" (NONE, empty, or degenerate output). */
export function cleanOcr(raw: string): string | null {
  const text = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  if (!text || /^none\.?$/i.test(text)) return null;
  const lines = text.split('\n').filter((l) => !/^none\.?$/i.test(l));
  const kept = lines.join('\n');
  if (!kept || isDegenerate(kept)) return null;
  return kept;
}
