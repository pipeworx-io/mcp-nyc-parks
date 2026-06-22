interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * NYC Parks Events MCP.
 *
 * Free & low-cost public events across New York City parks & recreation centers
 * from nycgovparks.org's keyless "Upcoming 14 Days" RSS feed (custom event:
 * namespace). Strong for outdoor / family / fitness / nature / kids programming
 * that commercial event APIs underserve. We parse + normalize the feed in-pack.
 */


const FEED = 'https://www.nycgovparks.org/xml/events_300_rss.xml';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const tools: McpToolExport['tools'] = [
  {
    name: 'events',
    description:
      'Upcoming NYC Parks events (next ~14 days): free/low-cost outdoor, fitness, nature, kids and recreation-center programming. Filter by date window, category (e.g. "Best for Kids", "Sports", "Nature", "Fitness"), and keyword (title/park/location/description).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Earliest event date YYYY-MM-DD (default: today).' },
        to: { type: 'string', description: 'Latest event date YYYY-MM-DD (default: no upper bound within the 14-day feed).' },
        category: { type: 'string', description: 'Filter by a category keyword, e.g. "Best for Kids", "Sports", "Nature", "Fitness", "Free". Discover via the categories tool.' },
        query: { type: 'string', description: 'Keyword over title, park name, location, and description.' },
        limit: { type: 'number', description: 'Max events to return (1-300, default 50).' },
      },
    },
  },
  {
    name: 'categories',
    description: 'List the categories used across NYC Parks events (with counts) — filterable facets like "Best for Kids", "Sports", "Nature Exploration", "Fitness".',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'How many top categories (default 50).' } } },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const events = await fetchEvents();
  switch (name) {
    case 'events':
      return filterEvents(events, args);
    case 'categories':
      return listCategories(events, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function fetchEvents(): Promise<ParkEvent[]> {
  const res = await fetch(FEED, { headers: { Accept: 'application/xml, text/xml', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`NYC Parks: HTTP ${res.status}`);
  return parseFeed(await res.text());
}

function filterEvents(events: ParkEvent[], args: Record<string, unknown>): unknown {
  const from = dateArg(args.from) || todayISO();
  const to = dateArg(args.to);
  const cat = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
  const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const limit = clamp(numArg(args.limit, 50), 1, 300);

  let out = events.filter((e) => {
    const d = e.start_date || '';
    if (d && d < from && !(e.end_date && e.end_date >= from)) return false;
    if (to && d && d > to) return false;
    if (cat && !e.categories.some((c) => c.toLowerCase().includes(cat))) return false;
    if (q && !`${e.title} ${e.park} ${e.location} ${e.description}`.toLowerCase().includes(q)) return false;
    return true;
  });
  out.sort((a, b) => `${a.start_date} ${pad4(parseTime(a.start_time))}`.localeCompare(`${b.start_date} ${pad4(parseTime(b.start_time))}`));

  return {
    metro: 'New York City',
    source: 'nycgovparks.org',
    date_from: from,
    date_to: to || null,
    total_matching: out.length,
    count: Math.min(out.length, limit),
    events: out.slice(0, limit),
  };
}

function listCategories(events: ParkEvent[], args: Record<string, unknown>): unknown {
  const counts = new Map<string, number>();
  for (const e of events) for (const c of e.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const limit = clamp(numArg(args.limit, 50), 1, 300);
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category, count]) => ({ category, count }));
  return { metro: 'New York City', count: categories.length, categories };
}

interface ParkEvent {
  id: string;
  title: string;
  url: string;
  description: string;
  park: string;
  location: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  end_time?: string;
  categories: string[];
  latitude?: number;
  longitude?: number;
  registration_url?: string;
}

function parseFeed(xml: string): ParkEvent[] {
  const out: ParkEvent[] = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const it of items) {
    const coords = tag(it, 'event:coordinates').split(',').map((s) => Number(s.trim()));
    out.push({
      id: tag(it, 'guid'),
      title: tag(it, 'title'),
      url: tag(it, 'link'),
      description: tag(it, 'description'),
      park: tag(it, 'event:parknames'),
      location: tag(it, 'event:location'),
      start_date: tag(it, 'event:startdate'),
      end_date: tag(it, 'event:enddate'),
      start_time: tag(it, 'event:starttime') || undefined,
      end_time: tag(it, 'event:endtime') || undefined,
      categories: tag(it, 'event:categories').split('|').map((c) => c.trim()).filter(Boolean),
      latitude: Number.isFinite(coords[0]) ? coords[0] : undefined,
      longitude: Number.isFinite(coords[1]) ? coords[1] : undefined,
      registration_url: tag(it, 'registration_url') || undefined,
    });
  }
  return out;
}

/** Extract a tag's text, unwrapping CDATA. */
function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name.replace(':', '\\:')}>([\\s\\S]*?)<\\/${name.replace(':', '\\:')}>`));
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return decode(v);
}
function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'").replace(/&nbsp;/g, ' ');
}
function parseTime(t?: string): number {
  if (!t) return 0;
  const m = t.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/);
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (m[3] === 'pm') h += 12;
  return h * 100 + Number(m[2]);
}
function pad4(n: number): string {
  return String(n).padStart(4, '0');
}
function dateArg(v: unknown): string {
  if (typeof v !== 'string') return '';
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function todayISO(): string {
  const d = new Date(Date.now() - 4 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
