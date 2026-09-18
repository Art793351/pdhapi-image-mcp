import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { ImageApi } from '../src/api.js';
import { loadConfig, VERSION } from '../src/config.js';

test('reported version matches package version', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, packageJson.version);
});

test('real stdio handshake exposes five tools without leaking environment key', async t => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/cli.js', import.meta.url))], env: { ...process.env, PDHAPI_API_KEY: 'never-output-this-test-key' }, stderr: 'pipe' });
  const client = new Client({ name: 'smoke', version: '1.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 5);
  const info = await client.callTool({ name: 'server_info', arguments: {} });
  const text = JSON.stringify(info);
  assert.ok(text.includes('pdhlzy.com'));
  assert.equal(text.includes('never-output-this-test-key'), false);
  assert.equal(info.isError, undefined);
});

test('SDK validates inputs and batch preserves completed work', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdhapi-mcp-sdk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const buffer = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer();
  const file = path.join(root, 'ref.png'); await writeFile(file, buffer);
  const config = loadConfig({ PDHAPI_API_KEY: 'fake-key', PDHAPI_SAVE_DIR: path.join(root, 'out') });
  let requests = 0;
  const api = new ImageApi(config, async () => {
    requests++;
    if (requests === 2) return Response.json({}, { status: 429 });
    return Response.json({ data: [{ b64_json: buffer.toString('base64') }] });
  });
  const server = createServer(config, api);
  const client = new Client({ name: 'test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => { await client.close(); await server.close(); });
  await server.connect(serverTransport); await client.connect(clientTransport);
  const invalid = await client.callTool({ name: 'image_generate', arguments: { prompt: 'test', size: '9999x9999' } });
  assert.equal(invalid.isError, true); assert.equal(requests, 0);
  const result = await client.callTool({ name: 'image_batch_edit', arguments: { prompt: 'test', image_paths: [file, file, file] } });
  assert.equal(result.isError, true); assert.equal(requests, 2);
  const summary = JSON.parse(result.content[0].text);
  assert.equal(summary.completed.length, 1); assert.equal(summary.failed_index, 1);
  assert.match(summary.error, /429/);
  const missing = await client.callTool({ name: 'image_batch_edit', arguments: { prompt: 'test', image_paths: [file, path.join(root, 'missing.png')] } });
  assert.equal(missing.isError, true); assert.equal(requests, 2);
});
