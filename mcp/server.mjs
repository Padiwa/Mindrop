#!/usr/bin/env node
// Serveur MCP (stdio, sans dépendance) : expose le second cerveau en lecture seule à un agent.
// Messages JSON-RPC 2.0, un par ligne sur stdin/stdout ; les journaux vont sur stderr.
import { createInterface } from 'node:readline';
import { load, search, tagIndex, related, full, TYPES } from './store.mjs';

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'second-cerveau', version: '1.0.0' };
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const INSTRUCTIONS = `Read-only access to the user's "Second Cerveau", a personal knowledge base saved from their browser: links, notes (Markdown), quotes, images and videos, each with #tags. Content is mostly in French.
Start with search_memories (accent-insensitive; "#tag" in the query filters by tag; an empty query lists the most recent). Use list_tags to see how the knowledge is organised, related_memories to follow connections through shared tags, and get_memory for the full text of one memory. Cite memories by title and URL when you use them.`;

const TOOLS = [
  {
    name: 'search_memories',
    title: 'Search memories',
    description: 'Search saved memories (links, notes, quotes, images, videos). Accent- and case-insensitive. Every word must match title, text, note, tags, description or URL; if nothing matches all words, results that match some words are returned instead (mode "any"). Words starting with # filter by tag prefix. An empty query returns the most recent memories. Returns short summaries; call get_memory for full content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for, e.g. "zettelkasten méthode" or "#design typographie". Empty for most recent.' },
        type: { type: 'string', enum: ['all', ...TYPES], description: 'Restrict to one kind of memory.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Every listed tag must be present (prefix match, without #).' },
        pinned: { type: 'boolean', description: 'true for pinned memories only.' },
        since: { type: 'string', description: 'ISO date; only memories saved on or after it.' },
        until: { type: 'string', description: 'ISO date; only memories saved on or before it.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        offset: { type: 'integer', minimum: 0, default: 0, description: 'For paging through results.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a, data) => ({ syncedAt: data.syncedAt, ...search(data.items, a) }),
  },
  {
    name: 'get_memory',
    title: 'Get one memory',
    description: 'Full content of one memory by id: title, URL, note text in Markdown, personal note, page description, tags, dates.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    annotations: READ_ONLY,
    run: (a, data) => {
      const it = data.items.find(x => x.id === a.id);
      if (!it) throw new Error(`Aucun souvenir avec l'id ${a.id}.`);
      return full(it);
    },
  },
  {
    name: 'list_tags',
    title: 'List tags',
    description: 'All tags with how many memories carry each, and for each tag the tags it most often appears with. Use it to understand the structure of the knowledge base before searching.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    run: (_, data) => ({ syncedAt: data.syncedAt, totalMemories: data.items.length, tags: tagIndex(data.items) }),
  },
  {
    name: 'related_memories',
    title: 'Related memories',
    description: 'Memories that share the most tags with a given memory, to follow connections in the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } },
      required: ['id'], additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a, data) => {
      const r = related(data.items, a.id, a.limit);
      if (!r) throw new Error(`Aucun souvenir avec l'id ${a.id}.`);
      return r;
    },
  },
];

const send = msg => process.stdout.write(JSON.stringify(msg) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function callTool(params) {
  const tool = TOOLS.find(t => t.name === params?.name);
  if (!tool) return { content: [{ type: 'text', text: `Outil inconnu : ${params?.name}` }], isError: true };
  try {
    const out = tool.run(params.arguments || {}, load());
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: String(e.message || e) }], isError: true };
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping': return ok(id, {});
    case 'tools/list': return ok(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case 'tools/call': return ok(id, callTool(params));
    default:
      if (isRequest) fail(id, -32601, `Méthode non prise en charge : ${method}`);
      // les notifications (notifications/initialized, cancelled…) n'attendent pas de réponse
  }
}

createInterface({ input: process.stdin }).on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'JSON invalide'); }
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    try { handle(m); } catch (e) { if (m?.id != null) fail(m.id, -32603, String(e.message || e)); }
  }
});
console.error(`[second-cerveau] serveur MCP prêt (${SERVER.version})`);
