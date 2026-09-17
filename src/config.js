import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { keychainGet } from './keychain.js';

export const VERSION = '0.1.0';
export const MODELS = ['gpt-image-2', 'gpt-image-2-2k', 'gpt-image-2-4k', 'gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];

export function normalizeBase(value) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error('Base URL requires HTTPS (HTTP is allowed only on loopback), without credentials, query or fragment.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';
  return url.toString().replace(/\/$/, '');
}

export function loadConfig(env = process.env) {
  const timeout = Number(env.PDHAPI_TIMEOUT_SECONDS || 300);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 900) throw new Error('PDHAPI_TIMEOUT_SECONDS must be 1-900.');
  const root = path.resolve(env.PDHAPI_SAVE_DIR || path.join(os.homedir(), 'Pictures', 'pdhapi-out'));
  const base = normalizeBase(env.PDHAPI_BASE_URL || 'https://pdhlzy.com');
  return {
    base, root, timeout: timeout * 1000,
    key: (env.PDHAPI_API_KEY || '').trim(), keyFile: env.PDHAPI_API_KEY_FILE || '',
    keychain: env.PDHAPI_API_KEY_KEYCHAIN === 'true',
    model: env.PDHAPI_MODEL || 'gpt-image-2.5-flare',
    editModel: env.PDHAPI_EDIT_MODEL || 'gpt-image-2.5-sunburst',
    inputRoot: env.PDHAPI_INPUT_ROOT ? path.resolve(env.PDHAPI_INPUT_ROOT) : null,
    downloadHosts: new Set([new URL(base).hostname, ...(env.PDHAPI_DOWNLOAD_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)])
  };
}

export async function getKey(config) {
  let key = config.key;
  if (!key && config.keychain) {
    try { key = await keychainGet(); }
    catch (e) { throw new Error(e.message); }
  }
  if (!key && config.keyFile) {
    try { key = (await readFile(config.keyFile, 'utf8')).trim(); }
    catch { throw new Error('Cannot read PDHAPI_API_KEY_FILE.'); }
  }
  if (!key || /[\r\n]/.test(key)) throw new Error('Set PDHAPI_API_KEY, PDHAPI_API_KEY_KEYCHAIN=true, or PDHAPI_API_KEY_FILE to a valid PdhAPI key.');
  return key;
}

export function publicInfo(config) {
  return { name: 'pdhapi-image-mcp', version: VERSION, base_url: config.base,
    api_key_source_configured: Boolean(config.key || config.keyFile || config.keychain),
    api_key_source: config.key ? 'env' : config.keychain ? 'keychain' : config.keyFile ? 'key-file' : 'none',
    default_model: config.model, default_edit_model: config.editModel,
    model_examples: MODELS, save_root: config.root, timeout_seconds: config.timeout / 1000,
    automatic_paid_retries: false, model_auto_switching: false,
    note: 'Model access depends on your key and group. Key-file presence does not verify authentication.' };
}
