import { parse, stringify } from '@std/yaml';

export interface SpecItem {
  id: string;
  placard: string;
  section: string | null;
  /** Playback mode from the image alt text, `![loop](capture_x)`; null means the arrangement's default. */
  play: string | null;
}

export interface ParsedSpec {
  front: Record<string, unknown>;
  items: SpecItem[];
  /** Body lines that are neither a section heading, a capture reference nor part of a placard. */
  stray: string[];
  /** `## Heading` names in order of appearance. */
  sectionsUsed: string[];
}

const REF = /^!\[([a-z]*)\]\(capture_([^)\s]+)\)\s*$/;
export const ARRANGEMENTS = ['list', 'wall', 'corridor', 'dial'] as const;
export const PLAY_MODES = ['press', 'loop', 'view', 'hover'] as const;

const FIELD_ORDER = ['title', 'thesis', 'curator', 'created', 'arrangement', 'sections', 'reveal_dates'];

export function splitFrontmatter(text: string): { front: Record<string, unknown>; body: string } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === '---');
  if (start < 0) throw new Error('no frontmatter');
  const end = lines.findIndex((l, i) => i > start && l.trim() === '---');
  if (end < 0) throw new Error('unterminated frontmatter');
  const front = parse(lines.slice(start + 1, end).join('\n'));
  if (front === null || typeof front !== 'object' || Array.isArray(front)) throw new Error('frontmatter is not a map');
  return { front: front as Record<string, unknown>, body: lines.slice(end + 1).join('\n') };
}

export function parseSpec(text: string): ParsedSpec {
  const { front, body } = splitFrontmatter(text);
  const items: SpecItem[] = [];
  const stray: string[] = [];
  const sectionsUsed: string[] = [];
  let section: string | null = null;
  let current: SpecItem | null = null;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const ref = line.match(REF);
    if (!line) {
      current = null;
    } else if (ref) {
      current = { id: ref[2], placard: '', section, play: ref[1] || null };
      items.push(current);
    } else if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      sectionsUsed.push(section);
      current = null;
    } else if (current) {
      current.placard = current.placard ? `${current.placard} ${line}` : line;
    } else {
      stray.push(line);
    }
  }
  return { front, items, stray, sectionsUsed };
}

/**
 * Take the model's raw output, drop anything before the first frontmatter fence (some account setups prepend
 * announcements), and stamp `curator` and `created` from code so the model cannot misattribute or backdate.
 */
export function assembleSpec(modelText: string, curator: string, created: string): string {
  const text = modelText.replace(/\r\n/g, '\n').replace(/^```(?:markdown|md)?\n/m, '').replace(/\n```\s*$/, '');
  const { front, body } = splitFrontmatter(text);
  const stamped: Record<string, unknown> = { ...front, curator, created };
  const ordered: Record<string, unknown> = {};
  for (const k of FIELD_ORDER) if (k in stamped) ordered[k] = stamped[k];
  for (const k of Object.keys(stamped)) if (!(k in ordered)) ordered[k] = stamped[k];
  return `---\n${stringify(ordered).trimEnd()}\n---\n${body.replace(/^\n+/, '\n').trimEnd()}\n`;
}
