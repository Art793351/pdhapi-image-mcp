import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import sharp from 'sharp';
import TOML from '@iarna/toml';
import { loadConfig, normalizeBase, getKey, publicInfo } from '../src/config.js';
import { ImageApi, loadInput, validateDownload, publicAddress } from '../src/api.js';
import { install } from '../src/install.js';

const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#00aa88' } }).png().toBuffer();
const imageResponse = () => Response.json({ data: [{ b64_json: png.toString('base64') }] });
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdhapi-mcp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, config: loadConfig({ PDHAPI_SAVE_DIR: path.join(root, 'out'), PDHAPI_API_KEY: 'test-only-not-a-real-key' }) };
}

test('root and /v1 endpoints normalize once', () => {
  for (const base of ['https://pdhlzy.com', 'https://pdhlzy.com/', 'https://pdhlzy.com/v1', 'https://pdhlzy.com/v1/']) assert.equal(normalizeBase(base), 'https://pdhlzy.com/v1');
  assert.equal(normalizeBase('https://example.com/proxy/v1/'), 'https://example.com/proxy/v1');
});
test('reject credentials, external HTTP, query and invalid timeout', () => {
  for (const base of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=abc', 'https://example.com/#x']) assert.throws(() => normalizeBase(base));
  assert.throws(() => loadConfig({ PDHAPI_TIMEOUT_SECONDS: 'NaN' }));
  assert.throws(() => loadConfig({ PDHAPI_TIMEOUT_SECONDS: '0' }));
});
test('public info never contains credential', () => {
  const c = loadConfig({ PDHAPI_API_KEY: 'private-test-marker' });
  assert.equal(JSON.stringify(publicInfo(c)).includes('private-test-marker'), false);
});
test('key file is read and trimmed, missing key fails', async t => {
  const { root } = await fixture(t);
  const file = path.join(root, 'private.txt');
  await writeFile(file, 'test-only-file-key\n');
  assert.equal(await getKey(loadConfig({ PDHAPI_API_KEY_FILE: file })), 'test-only-file-key');
  await assert.rejects(getKey(loadConfig({})), /Set PDHAPI_API_KEY/);
});
test('generation posts UTF-8 and returns decoded local output plus preview', async t => {
  const { config } = await fixture(t); let calls = 0;
  const api = new ImageApi(config, async (url, options) => {
    calls++;
    assert.equal(url, 'https://pdhlzy.com/v1/images/generations');
    const body = JSON.parse(options.body);
    assert.equal(body.prompt, '\u751f\u6210\u4e00\u4e2a\u676f\u5b50');
    assert.equal(body.model, 'gpt-image-2.5-flare');
    assert.equal(body.response_format, 'b64_json');
    assert.equal(options.redirect, 'error');
    return imageResponse();
  });
  const result = await api.request({ prompt: '\u751f\u6210\u4e00\u4e2a\u676f\u5b50' });
  assert.equal(calls, 1); assert.equal(result.saved[0].width, 32);
  assert.deepEqual(await readFile(result.saved[0].path), png);
  assert.equal(result.previews[0].mimeType, 'image/webp');
  assert.equal(result.requested_size, '1024x1024');
  assert.match(result.warnings[0], /Requested 1024x1024, received 32x32/);
});
test('automatic size does not report a false dimension mismatch', async t => {
  const { config } = await fixture(t);
  const result = await new ImageApi(config, async () => imageResponse()).request({ prompt: 'test', size: 'auto' });
  assert.deepEqual(result.warnings, []);
});
test('model is passed unchanged for 4K requests', async t => {
  const { config } = await fixture(t);
  const api = new ImageApi(config, async (_, options) => {
    assert.equal(JSON.parse(options.body).model, 'gpt-image-2.5-sunburst');
    assert.equal(JSON.parse(options.body).size, '3840x2160');
    return imageResponse();
  });
  await api.request({ prompt: 'test', model: 'gpt-image-2.5-sunburst', size: '3840x2160' });
});
test('single and multi-reference use correct multipart fields', async t => {
  const { root, config } = await fixture(t);
  const file = path.join(root, 'reference.png'); await writeFile(file, png);
  const input = await loadInput(file, config);
  let count = 0;
  const api = new ImageApi(config, async (url, options) => {
    assert.equal(url, 'https://pdhlzy.com/v1/images/edits');
    assert.equal(options.headers['Content-Type'], undefined);
    assert.equal(options.body.get('model'), 'gpt-image-2.5-sunburst');
    if (count++ === 0) assert.equal(options.body.getAll('image').length, 1);
    else assert.equal(options.body.getAll('image[]').length, 2);
    return imageResponse();
  });
  await api.request({ prompt: 'edit' }, [input]);
  await api.request({ prompt: 'mix' }, [input, input]);
});
test('no automatic retry and no upstream secrets in errors', async t => {
  const { config } = await fixture(t); let calls = 0;
  const api = new ImageApi(config, async () => { calls++; return Response.json({ error: 'sensitive upstream body' }, { status: 502 }); });
  await assert.rejects(api.request({ prompt: 'test' }), e => e.message.includes('HTTP 502') && !e.message.includes('sensitive'));
  assert.equal(calls, 1);
});
test('network timeout explains uncertain charge without retry', async t => {
  const { config } = await fixture(t); let calls = 0;
  const api = new ImageApi(config, async () => { calls++; throw new Error('upstream-key-secret'); });
  await assert.rejects(api.request({ prompt: 'test' }), /check usage before retrying/);
  assert.equal(calls, 1);
});
test('insufficient balance produces an actionable error without leaking provider data', async t => {
  const { config } = await fixture(t);
  const api = new ImageApi(config, async () => Response.json({ error: {
    code: 'insufficient_user_quota', message: 'private account balance and secret'
  } }, { status: 403 }));
  await assert.rejects(api.request({ prompt: 'test' }), error =>
    error.message.includes('account balance is insufficient') &&
    !error.message.includes('private account') && !error.message.includes('secret'));
});
test('missing key produces zero network calls', async t => {
  const { config } = await fixture(t); config.key = '';
  const api = new ImageApi(config, () => assert.fail('must not call'));
  await assert.rejects(api.request({ prompt: 'test' }), /PDHAPI_API_KEY/);
});
test('URL download carries no authorization', async t => {
  const { config } = await fixture(t); config.downloadHosts.add('cdn.example.com'); let calls = 0;
  const api = new ImageApi(config, async (url, options) => {
    if (calls++ === 0) return Response.json({ data: [{ url: 'https://cdn.example.com/image.png?signature=private' }] });
    assert.equal(options.headers, undefined); assert.equal(options.redirect, 'error'); assert.ok(options.dispatcher);
    return new Response(png);
  });
  const result = await api.request({ prompt: 'test', response_format: 'url' });
  assert.equal(calls, 2); assert.equal(JSON.stringify(result).includes('signature'), false);
});
test('reject unapproved URL hosts, IP literals and local protocols', () => {
  const config = loadConfig({ PDHAPI_DOWNLOAD_HOSTS: 'cdn.example.com,127.0.0.1' });
  for (const url of ['http://cdn.example.com/a', 'https://127.0.0.1/a', 'https://unknown.example/a', 'https://cdn.example.com:8443/a', 'https://user:pass@cdn.example.com/a']) assert.throws(() => validateDownload(url, config));
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '198.18.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('1.1.1.1'), true);
});
test('invalid, empty and oversized image responses fail clearly', async t => {
  const { config } = await fixture(t);
  for (const response of [Response.json({ data: [] }), Response.json({ data: [{ b64_json: 'not valid' }] }), new Response('not-json'), new Response('{}', { headers: { 'content-length': '200000000' } })]) {
    await assert.rejects(new ImageApi(config, async () => response).request({ prompt: 'test' }));
  }
});
test('output remains recorded after a partial image response fails', async t => {
  const { config } = await fixture(t);
  const api = new ImageApi(config, async () => Response.json({ data: [{ b64_json: png.toString('base64') }, { b64_json: 'bad' }] }));
  await assert.rejects(api.request({ prompt: 'test' }), e => e.message.includes('Saved files: [{') && e.message.includes('No regeneration'));
});
test('input root rejects path escapes and symlink escapes', async t => {
  const { root, config } = await fixture(t);
  config.inputRoot = path.join(root, 'allowed'); await mkdir(config.inputRoot);
  const outside = path.join(root, 'outside.png'); await writeFile(outside, png);
  await assert.rejects(loadInput(outside, config), /outside/);
  await assert.rejects(loadInput('relative.png', config), /absolute/);
  try { await symlink(outside, path.join(config.inputRoot, 'link.png')); }
  catch (e) { if (e.code === 'EPERM') return; throw e; }
  await assert.rejects(loadInput(path.join(config.inputRoot, 'link.png'), config), /outside/);
});
test('queue serializes work and recovers after failure', async t => {
  const { config } = await fixture(t); const api = new ImageApi(config); const events = [];
  const first = api.queued(async () => { events.push(1); await new Promise(r => setTimeout(r, 15)); events.push(2); throw new Error('expected'); });
  const second = api.queued(async () => events.push(3));
  await Promise.allSettled([first, second]); assert.deepEqual(events, [1, 2, 3]); assert.equal(api.pending, 0);
});
test('cancelled queued work makes no API request', async t => {
  const { config } = await fixture(t); const api = new ImageApi(config);
  const signal = AbortSignal.abort();
  await assert.rejects(api.queued(() => assert.fail('must not run'), signal));
});
for (const client of ['codex', 'claude', 'cursor']) {
  test(`${client} installer preserves other settings and makes exact backup`, async t => {
    const { root } = await fixture(t); const file = path.join(root, client === 'codex' ? 'config.toml' : 'config.json');
    const section = client === 'codex' ? 'mcp_servers' : 'mcpServers';
    const doc = { custom: { enabled: true }, [section]: { other: { command: 'existing-tool', args: ['abc'] } } };
    const initial = client === 'codex' ? TOML.stringify(doc) : JSON.stringify(doc);
    await writeFile(file, initial);
    const keyFile = path.join(root, 'private-key.txt');
    await writeFile(keyFile, 'test-only-fake-key-for-install-0123456789', 'utf8');
    const result = await install(client, { config: file, keyFile });
    assert.equal(await readFile(result.backup, 'utf8'), initial);
    const updated = client === 'codex' ? TOML.parse(await readFile(file, 'utf8')) : JSON.parse(await readFile(file, 'utf8'));
    assert.deepEqual(updated.custom, doc.custom); assert.deepEqual(updated[section].other, doc[section].other);
    assert.equal(updated[section]['pdhapi-image'].env.PDHAPI_BASE_URL, 'https://pdhlzy.com');
    assert.equal(updated[section]['pdhapi-image'].env.PDHAPI_API_KEY, undefined);
    await install(client, { config: file });
    const reinstalled = client === 'codex' ? TOML.parse(await readFile(file, 'utf8')) : JSON.parse(await readFile(file, 'utf8'));
    assert.equal(reinstalled[section]['pdhapi-image'].env.PDHAPI_API_KEY_FILE, path.join(root, 'private-key.txt'));
  });
}
test('invalid client config is never overwritten', async t => {
  const { root } = await fixture(t); const file = path.join(root, 'bad.json'); await writeFile(file, '{invalid');
  await assert.rejects(install('cursor', { config: file }), /invalid/);
  assert.equal(await readFile(file, 'utf8'), '{invalid');
});
