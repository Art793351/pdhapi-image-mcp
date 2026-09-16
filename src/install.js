import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import TOML from '@iarna/toml';

const clients = ['codex', 'claude', 'cursor'];
export function clientEntry(client, { keyFile, output } = {}) {
  if (!clients.includes(client)) throw new Error('Client must be codex, claude or cursor.');
  const entry = { command: process.execPath, args: [fileURLToPath(new URL('./cli.js', import.meta.url))],
    env: { PDHAPI_BASE_URL: 'https://pdhlzy.com' } };
  if (client === 'codex') { entry.env_vars = ['PDHAPI_API_KEY', 'PDHAPI_API_KEY_FILE']; entry.tool_timeout_sec = 900; }
  if (keyFile) entry.env.PDHAPI_API_KEY_FILE = path.resolve(keyFile);
  if (output) entry.env.PDHAPI_SAVE_DIR = path.resolve(output);
  return entry;
}

export function configDocument(client, options = {}) {
  return { [client === 'codex' ? 'mcp_servers' : 'mcpServers']: { 'pdhapi-image': clientEntry(client, options) } };
}

export function serialize(client, document) {
  return client === 'codex' ? TOML.stringify(document) : JSON.stringify(document, null, 2) + '\n';
}

export function defaultConfigPath(client) {
  const home = os.homedir();
  if (client === 'codex') return path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'config.toml');
  if (client === 'claude') return path.join(home, '.claude.json');
  if (client === 'cursor') return path.join(home, '.cursor', 'mcp.json');
  throw new Error('Client must be codex, claude or cursor.');
}

async function readOptional(file) {
  try { return await readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
}

export async function install(client, options = {}) {
  const entry = clientEntry(client, options);
  const file = path.resolve(options.config || defaultConfigPath(client));
  await mkdir(path.dirname(file), { recursive: true });
  const lockPath = file + '.pdhapi-install.lock';
  const lock = await open(lockPath, 'wx', 0o600);
  let temporary;
  try {
    const previous = await readOptional(file);
    const parse = client === 'codex' ? TOML.parse : JSON.parse;
    let doc;
    try { doc = previous ? parse(previous) : {}; } catch { throw new Error('Existing config is invalid; no changes were made.'); }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('Existing config must be an object.');
    const key = client === 'codex' ? 'mcp_servers' : 'mcpServers';
    if (doc[key] && (typeof doc[key] !== 'object' || Array.isArray(doc[key]))) throw new Error('Invalid MCP config section.');
    doc[key] ||= {};
    const existing = doc[key]['pdhapi-image'] || {};
    doc[key]['pdhapi-image'] = { ...existing, ...entry, env: { ...entry.env, ...existing.env } };
    if (options.keyFile) doc[key]['pdhapi-image'].env.PDHAPI_API_KEY_FILE = path.resolve(options.keyFile);
    if (options.output) doc[key]['pdhapi-image'].env.PDHAPI_SAVE_DIR = path.resolve(options.output);
    if (client === 'codex') doc[key]['pdhapi-image'].env_vars = [...new Set([...(existing.env_vars || []), ...entry.env_vars])];
    const contents = serialize(client, doc);
    parse(contents);
    const backup = previous ? file + '.bak-pdhapi-' + Date.now() + '-' + randomUUID() : null;
    if (backup) await writeFile(backup, previous, { flag: 'wx', mode: 0o600 });
    temporary = file + '.tmp-' + randomUUID();
    await writeFile(temporary, contents, { flag: 'wx', mode: 0o600 });
    if (await readOptional(file) !== previous) throw new Error('Config changed during installation; run again.');
    await rename(temporary, file);
    temporary = null;
    return { client, config: file, backup, restart_required: true };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}
