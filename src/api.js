import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns';
import path from 'node:path';
import { mkdir, realpath, open, writeFile } from 'node:fs/promises';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import { Agent } from 'undici';
import { getKey } from './config.js';

const MAX_IMAGE = 30 * 1024 * 1024;
const MAX_RESPONSE = 180 * 1024 * 1024;
export class UserError extends Error {}

export function publicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

// Validate DNS results at socket creation, not in a separate preflight lookup.
export const downloadAgent = new Agent({ connect: { lookup(host, options, callback) {
  lookup(host, { all: true, verbatim: true }, (error, records) => {
    if (error || !records?.length || records.some(r => !publicAddress(r.address))) {
      callback(new Error('Image download resolved to a non-public address.')); return;
    }
    const eligible = options.family ? records.filter(r => r.family === options.family) : records;
    if (!eligible.length) { callback(new Error('No compatible public address.')); return; }
    if (options.all) callback(null, eligible);
    else callback(null, eligible[0].address, eligible[0].family);
  });
} } });

export function validateDownload(value, config) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !config.downloadHosts.has(url.hostname) || ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new UserError('Image URL is not an approved HTTPS host. Add its exact host to PDHAPI_DOWNLOAD_HOSTS, or use b64_json.');
  }
  return url;
}

async function limitedBody(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw new UserError('Response exceeds the size limit.');
  }
  const chunks = []; let length = 0;
  for await (const chunk of response.body || []) {
    length += chunk.length;
    if (length > limit) throw new UserError('Response exceeds the size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function imageMetadata(buffer) {
  if (buffer.length > MAX_IMAGE) throw new UserError('Image exceeds 30 MiB.');
  try {
    const meta = await sharp(buffer, { limitInputPixels: 16777216, failOn: 'warning' }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) throw new Error();
    return meta;
  } catch { throw new UserError('Expected a non-animated PNG, JPEG or WebP, at most 16 megapixels.'); }
}

export async function loadInput(file, config) {
  if (!path.isAbsolute(file)) throw new UserError('Reference image paths must be absolute.');
  let handle;
  try {
    const resolved = await realpath(file);
    if (config.inputRoot) {
      const root = await realpath(config.inputRoot);
      const rel = path.relative(root, resolved);
      if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new UserError('Reference image is outside PDHAPI_INPUT_ROOT.');
    }
    handle = await open(resolved, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_IMAGE) throw new UserError('Reference must be a file no larger than 30 MiB.');
    const buffer = await handle.readFile();
    const meta = await imageMetadata(buffer);
    return { buffer, type: 'image/' + meta.format, name: 'reference.' + meta.format };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError('Cannot read reference image.');
  } finally { await handle?.close(); }
}

export class ImageApi {
  constructor(config, transport = fetch) { this.config = config; this.transport = transport; this.tail = Promise.resolve(); this.pending = 0; }

  async queued(work, signal) {
    if (this.pending >= 10) throw new UserError('Image queue is full; wait for current work to finish.');
    this.pending++;
    const job = this.tail.then(() => { signal?.throwIfAborted(); return work(); });
    this.tail = job.catch(() => {});
    try { return await job; } finally { this.pending--; }
  }

  async request(args, inputs = [], signal) {
    let key = args.api_key;
    if (!key) {
      try { key = await getKey(this.config); }
      catch { throw new UserError('Set PDHAPI_API_KEY or a readable PDHAPI_API_KEY_FILE before generating images.'); }
    }
    const model = args.model || (inputs.length ? this.config.editModel : this.config.model);
    const fields = { model, prompt: args.prompt, size: args.size || '1024x1024', n: args.n || 1,
      response_format: args.response_format || 'b64_json' };
    if (args.quality) fields.quality = args.quality;
    let body; const headers = { Authorization: `Bearer ${key}` };
    if (inputs.length) {
      body = new FormData();
      for (const [k, v] of Object.entries(fields)) body.set(k, String(v));
      for (const image of inputs) body.append(inputs.length === 1 ? 'image' : 'image[]', new Blob([image.buffer], { type: image.type }), image.name);
    } else { body = JSON.stringify(fields); headers['Content-Type'] = 'application/json'; }
    const timer = AbortSignal.timeout(this.config.timeout);
    const combined = signal ? AbortSignal.any([signal, timer]) : timer;
    let response;
    try {
      response = await this.transport(this.config.base + '/images/' + (inputs.length ? 'edits' : 'generations'),
        { method: 'POST', headers, body, redirect: 'error', signal: combined });
    } catch { throw new UserError('Image request interrupted or timed out. It may have reached the provider; check usage before retrying.'); }
    if (!response.ok) {
      let reason = 'Check key, group, model access and upstream status.';
      // Only translate known error codes; provider bodies may contain private data.
      const reasons = new Map([
        ['insufficient_user_quota', 'The PdhAPI account balance is insufficient. Top up the account before retrying.'],
        ['insufficient_token_quota', 'This API key has insufficient quota. Check its quota limit.'],
        ['token_quota_not_enough', 'This API key has insufficient quota. Check its quota limit.'],
        ['invalid_api_key', 'The API key is invalid. Check PDHAPI_API_KEY or PDHAPI_API_KEY_FILE.'],
        ['model_not_found', 'No channel is available for this model in the key group. Check model access.']
      ]);
      try {
        const error = JSON.parse((await limitedBody(response, 32768)).toString('utf8'));
        reason = reasons.get(error.error?.code ?? error.code) || reason;
      } catch {}
      throw new UserError(`PdhAPI returned HTTP ${response.status}. ${reason} No automatic retry was made.`);
    }
    let data;
    try { data = JSON.parse((await limitedBody(response, MAX_RESPONSE)).toString('utf8')); }
    catch (e) { if (e instanceof UserError) throw e; throw new UserError('Incomplete or invalid image response. Check usage before retrying.'); }
    if (!Array.isArray(data.data) || !data.data.length || data.data.length > 4) throw new UserError('PdhAPI returned no usable image data. Check usage before retrying.');
    const output = []; const previews = [];
    await mkdir(this.config.root, { recursive: true });
    const root = await realpath(this.config.root);
    try {
      for (const item of data.data) {
        let bytes;
        if (item.b64_json) {
          if (typeof item.b64_json !== 'string' || item.b64_json.length > Math.ceil(MAX_IMAGE / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) throw new UserError('Invalid or oversized base64 image.');
          bytes = Buffer.from(item.b64_json, 'base64');
        } else if (item.url) {
          const url = validateDownload(item.url, this.config);
          let download;
          try { download = await this.transport(url, { redirect: 'error', signal: combined, dispatcher: downloadAgent }); }
          catch { throw new UserError('Image download failed; verify the approved CDN and network.'); }
          if (!download.ok) { await download.body?.cancel(); throw new UserError(`Image download returned HTTP ${download.status}.`); }
          bytes = await limitedBody(download, MAX_IMAGE);
        } else throw new UserError('Image result contains neither b64_json nor URL.');
        const meta = await imageMetadata(bytes);
        let preview;
        try { preview = await sharp(bytes, { limitInputPixels: 16777216, failOn: 'warning' }).resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(); }
        catch { throw new UserError('Image payload cannot be decoded.'); }
        const filename = path.join(root, `${Date.now()}-${randomUUID()}.${meta.format === 'jpeg' ? 'jpg' : meta.format}`);
        await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
        output.push({ path: filename, width: meta.width, height: meta.height, bytes: bytes.length });
        previews.push({ type: 'image', mimeType: 'image/webp', data: preview.toString('base64') });
      }
    } catch (error) {
      const reason = error instanceof UserError ? error.message : 'Could not save image output.';
      throw new UserError(`${reason} Generation may already be billed. Saved files: ${JSON.stringify(output)}. No regeneration was attempted.`);
    }
    const warnings = fields.size === 'auto' ? [] : output
      .filter(item => `${item.width}x${item.height}` !== fields.size)
      .map(item => `Requested ${fields.size}, received ${item.width}x${item.height}. Original output was preserved.`);
    return { model, requested_size: fields.size, saved: output, warnings, previews };
  }
}
