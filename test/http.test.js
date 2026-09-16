import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { loadConfig } from '../src/config.js';
import { ImageApi } from '../src/api.js';

test('real HTTP transport sends JSON and multipart without double /v1', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdhapi-http-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer();
  const seen = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    seen.push({ url: req.url, headers: req.headers, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ b64_json: image.toString('base64') }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const config = loadConfig({ PDHAPI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1/`, PDHAPI_SAVE_DIR: root, PDHAPI_API_KEY: 'fake-http-test-key' });
  const api = new ImageApi(config);
  await api.request({ prompt: '\u676f\u5b50' });
  await api.request({ prompt: 'edit' }, [{ buffer: image, type: 'image/png', name: 'reference.png' }]);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, '/v1/images/generations');
  assert.equal(JSON.parse(seen[0].body).prompt, '\u676f\u5b50');
  assert.equal(seen[0].headers.authorization, 'Bearer fake-http-test-key');
  assert.equal(seen[1].url, '/v1/images/edits');
  assert.match(seen[1].headers['content-type'], /multipart\/form-data; boundary=/);
  assert.ok(seen[1].body.includes(Buffer.from('name="image"')));
  assert.ok(seen[1].body.includes(image));
});

test('HTTP redirects are not followed with authorization', async t => {
  let followed = 0;
  const target = http.createServer((req, res) => { followed++; res.end('{}'); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  const source = http.createServer((req, res) => { res.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/capture` }); res.end(); });
  source.listen(0, '127.0.0.1'); await once(source, 'listening');
  t.after(async () => {
    for (const server of [source, target]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  });
  const api = new ImageApi(loadConfig({ PDHAPI_BASE_URL: `http://127.0.0.1:${source.address().port}`, PDHAPI_API_KEY: 'fake-test-key' }));
  await assert.rejects(api.request({ prompt: 'test' }), /interrupted/);
  assert.equal(followed, 0);
});
