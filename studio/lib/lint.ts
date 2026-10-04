import { ARRANGEMENTS, type ParsedSpec, parseSpec, PLAY_MODES } from './spec.ts';

export interface Violation {
  rule: string;
  where: string;
  detail: string;
}

export interface LintOptions {
  knownIds: (id: string) => boolean;
  minItems?: number;
  maxItems?: number;
}

// Voice rules from CLAUDE.md as deterministic patterns. Deliberately narrow: a false positive costs a retry.
const VOICE: { rule: string; re: RegExp }[] = [
  { rule: 'second-person', re: /\b(you|your|yours|yourself|you're|you've|you'll)\b/i },
  { rule: 'first-person', re: /\b(I|I'm|I've|I'll)\b|\b(me|my|mine|we|our|ours)\b/i },
  {
    rule: 'nostalgia',
    re: /\b(on this day|ago today|remember(ed|ing)?|memor(y|ies)|nostalg\w*|throwback|back then|good old)\b/i,
  },
  { rule: 'advice', re: /\b(should|ought|maybe|consider|try|recommend\w*|suggest\w*)\b/i },
  { rule: 'speculation', re: /\b(seem(s|ed)?|probably|likely|presumably|apparently|perhaps|might|as if|must have)\b/i },
  {
    rule: 'judgement-or-emotion',
    re:
      /\b(happy|sad|lonely|joy\w*|special|beautiful|lovely|stunning|magical|peaceful|cozy|adventurous|meaningful|precious|perfect|amazing|wonderful|bittersweet|tender|intimate|productive|productivity|journey|growth)\b/i,
  },
  { rule: 'metaphor', re: /\b(tells? a story|story of)\b/i },
  { rule: 'punctuation', re: /[!?]/ },
  { rule: 'markup', re: /<\/?[a-z][^>]*>|\]\(https?:/i },
];

function voice(text: string, where: string, out: Violation[]) {
  for (const { rule, re } of VOICE) {
    const m = text.match(re);
    if (m) out.push({ rule, where, detail: `"${m[0]}"` });
  }
}

export function lintParsed(spec: ParsedSpec, o: LintOptions): Violation[] {
  const v: Violation[] = [];
  const { front, items } = spec;
  const min = o.minItems ?? 4;
  const arr = front.arrangement;
  const max = o.maxItems ?? (arr === 'wall' ? 24 : 10);
  if (arr !== undefined && !(ARRANGEMENTS as readonly string[]).includes(String(arr))) {
    v.push({ rule: 'frontmatter', where: 'arrangement', detail: `must be one of ${ARRANGEMENTS.join(', ')}` });
  }

  for (const k of ['title', 'thesis'] as const) {
    const val = front[k];
    if (typeof val !== 'string' || !val.trim()) v.push({ rule: 'frontmatter', where: k, detail: 'missing or empty' });
    else {
      voice(val, k, v);
      if (val.includes('\n') || val.length > (k === 'title' ? 80 : 200)) {
        v.push({ rule: 'length', where: k, detail: `${k} must be one short line` });
      }
    }
  }
  const rd = front.reveal_dates;
  if (rd !== undefined && !['never', 'after', 'always'].includes(String(rd))) {
    v.push({ rule: 'frontmatter', where: 'reveal_dates', detail: 'must be never, after or always' });
  }

  if (items.length < min || items.length > max) {
    v.push({ rule: 'count', where: 'body', detail: `${items.length} specimens; need ${min} to ${max}` });
  }
  const seen = new Set<string>();
  for (const it of items) {
    const where = `capture_${it.id}`;
    if (seen.has(it.id)) v.push({ rule: 'duplicate', where, detail: 'specimen listed twice' });
    seen.add(it.id);
    if (!o.knownIds(it.id)) v.push({ rule: 'unknown-id', where, detail: 'not in the catalog' });
    if (it.play !== null && !(PLAY_MODES as readonly string[]).includes(it.play)) {
      v.push({ rule: 'playback', where, detail: `must be one of ${PLAY_MODES.join(', ')}` });
    }
    if (!it.placard) v.push({ rule: 'placard', where, detail: 'missing placard' });
    else {
      voice(it.placard, where, v);
      if (it.placard.length > 240) v.push({ rule: 'length', where, detail: 'placard over 240 characters' });
    }
  }
  for (const s of spec.stray) v.push({ rule: 'stray-text', where: 'body', detail: s.slice(0, 60) });

  const declared = Array.isArray(front.sections) ? front.sections.map(String) : [];
  for (const s of spec.sectionsUsed) {
    if (!declared.includes(s)) v.push({ rule: 'sections', where: s, detail: 'heading not declared in frontmatter' });
  }
  for (const s of declared) {
    if (!spec.sectionsUsed.includes(s)) v.push({ rule: 'sections', where: s, detail: 'declared but unused' });
  }
  for (const s of declared) voice(s, 'sections', v);
  return v;
}

export function lintSpec(text: string, o: LintOptions): Violation[] {
  try {
    return lintParsed(parseSpec(text), o);
  } catch (e) {
    return [{ rule: 'parse', where: 'spec', detail: (e as Error).message }];
  }
}

export const formatViolations = (vs: Violation[]) => vs.map((x) => `- ${x.rule} (${x.where}): ${x.detail}`).join('\n');
