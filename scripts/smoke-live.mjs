import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getKey, loadConfig } from '../src/config.js';

// Explicit opt-in: this script generates one paid image and never retries.
if (!process.argv.includes('--paid-one-image')) {
  console.error('Use --paid-one-image to authorize one live generation.');
  process.exit(2);
}
const config = loadConfig();
const key = await getKey(config);
const root = path.resolve('outputs', 'live-' + new Date().toISOString().replace(/[:.]/g, '-'));
const report = { started_at: new Date().toISOString(), base_url: config.base, model: config.model };
let client;
try {
  const models = await fetch(config.base + '/models', {
    headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(30000)
  });
  report.models_http_status = models.status;
  if (!models.ok) { await models.body?.cancel(); throw new Error('Model authorization check failed.'); }
  const catalog = await models.json();
  report.image_models = (catalog.data || []).map(m => m.id).filter(id => typeof id === 'string' && id.includes('image'));
  console.log(JSON.stringify({ stage: 'models', http_status: models.status, image_models: report.image_models }));
  if (!report.image_models.includes(config.model)) throw new Error('Default generation model is not listed for this key.');
  const transport = new StdioClientTransport({
    command: process.execPath, args: [fileURLToPath(new URL('../src/cli.js', import.meta.url))],
    env: { ...process.env, PDHAPI_API_KEY: key, PDHAPI_SAVE_DIR: root }, stderr: 'pipe'
  });
  client = new Client({ name: 'pdhapi-live-acceptance', version: '0.1.0' });
  await client.connect(transport);
  const info = await client.callTool({ name: 'server_info', arguments: {} });
  report.server_info = JSON.parse(info.content.find(c => c.type === 'text').text);
  const start = performance.now();
  console.log(JSON.stringify({ stage: 'generating', model: config.model, size: '1024x1024', count: 1 }));
  const result = await client.callTool({ name: 'image_generate', arguments: {
    prompt: 'A studio product photograph of a plain white ceramic coffee cup on a pale gray table, soft natural light, centered composition, no text, no logos.',
    size: '1024x1024', n: 1
  } }, undefined, { timeout: config.timeout + 30000 });
  report.elapsed_seconds = Math.round((performance.now() - start) / 100) / 10;
  report.result = JSON.parse(result.content.find(c => c.type === 'text').text);
  report.preview_count = result.content.filter(c => c.type === 'image').length;
  report.success = !result.isError && Boolean(report.result.saved?.length);
  console.log(JSON.stringify({ stage: 'finished', success: report.success, elapsed_seconds: report.elapsed_seconds,
    result: report.result, preview_count: report.preview_count }));
  if (!report.success) process.exitCode = 1;
} catch (error) {
  report.success = false;
  report.error_type = error.name;
  console.error(JSON.stringify({ success: false, error_type: error.name, models_http_status: report.models_http_status,
    note: 'No automatic retry. Check the model list, connectivity and usage before retrying.' }));
  process.exitCode = 1;
} finally {
  await client?.close();
  report.finished_at = new Date().toISOString();
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'report.json');
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ report: file }));
}
