import type { Database } from '@db/sqlite';
import { type Filters, getSpecimen, listLocations, overview, queryCatalog } from './tools.ts';

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(db: Database, args: Record<string, unknown>): string;
}

const str = (description: string) => ({ type: 'string', description });

export const TOOLS: Tool[] = [
  {
    name: 'overview',
    description: 'Shape of the catalog in one call: counts, date range, facets. Call this first.',
    inputSchema: { type: 'object', properties: {} },
    call: (db) => overview(db),
  },
  {
    name: 'query_catalog',
    description:
      'List specimens matching filters, capped at 40 rows. Returns id, local time, place, time of day, motion, audio, ' +
      'seconds, top colors. Use get_specimen to read the scene description and OCR text of one specimen. All filters optional and combined with AND.',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: str('YYYY-MM-DD, inclusive, device-local date'),
        date_to: str('YYYY-MM-DD, inclusive'),
        time_of_day: { type: 'string', enum: ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'] },
        place: str('substring of the place name, e.g. "Kanagawa"'),
        text: str('substring of the scene description or of text read from the image (OCR), case-insensitive'),
        motion_state: { type: 'string', enum: ['still', 'slight', 'high'] },
        audio_state: { type: 'string', enum: ['silent', 'quiet', 'moderate', 'loud', 'none'] },
        has_location: { type: 'boolean' },
        color_hex: str('#rrggbb; matches specimens with a dominant color (weight >= 10%) near this one'),
        order: { type: 'string', enum: ['asc', 'desc'], description: 'by capture time; default asc' },
        limit: { type: 'integer', description: 'default 20, max 40' },
      },
    },
    call: (db, a) => queryCatalog(db, a as Filters),
  },
  {
    name: 'list_locations',
    description: 'Place names in the catalog with counts and date ranges (top 40).',
    inputSchema: { type: 'object', properties: {} },
    call: (db) => listLocations(db),
  },
  {
    name: 'get_specimen',
    description: 'All catalog fields for one specimen id.',
    inputSchema: { type: 'object', properties: { id: str('capture_id') }, required: ['id'] },
    call: (db, a) => getSpecimen(db, String(a.id)),
  },
];

interface Request {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/** Handle one JSON-RPC message. Returns null for notifications. */
export function handle(db: Database, req: Request): Record<string, unknown> | null {
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: req.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: '2.0', id: req.id, error: { code, message } });
  if (req.id === undefined) return null;
  switch (req.method) {
    case 'initialize':
      return ok({
        protocolVersion: (req.params?.protocolVersion as string) ?? '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'life-museum-catalog', version: '1' },
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === req.params?.name);
      if (!tool) return err(-32602, `unknown tool ${req.params?.name}`);
      try {
        const text = tool.call(db, (req.params?.arguments as Record<string, unknown>) ?? {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
      }
    }
    default:
      return err(-32601, `method not found: ${req.method}`);
  }
}
