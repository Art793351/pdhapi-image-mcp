import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ImageApi, loadInput, UserError } from './api.js';
import { publicInfo, VERSION } from './config.js';

const size = z.string().regex(/^(auto|[1-9]\d{2,3}x[1-9]\d{2,3})$/).refine(value => {
  if (value === 'auto') return true;
  const [w, h] = value.split('x').map(Number);
  return w <= 4096 && h <= 4096 && w * h <= 16777216 && w % 16 === 0 && h % 16 === 0;
}, 'Dimensions must be multiples of 16, at most 4096 per side.').default('1024x1024');
const common = { prompt: z.string().min(1).max(32000), model: z.string().min(1).max(150).optional(), size,
  quality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  response_format: z.enum(['b64_json', 'url']).default('b64_json') };
const n = z.number().int().min(1).max(4).default(1);
const text = value => ({ type: 'text', text: JSON.stringify(value, null, 2) });
const render = result => ({ content: [text({ model: result.model, requested_size: result.requested_size, saved: result.saved, warnings: result.warnings }), ...result.previews] });

export function createServer(config, api = new ImageApi(config)) {
  const server = new McpServer({ name: 'pdhapi-image-mcp', version: VERSION });
  const wrap = fn => async (args, extra) => {
    try { return await fn(args, extra.signal); }
    catch (error) { return { isError: true, content: [text({ error: error instanceof UserError ? error.message : 'Operation failed. Check local configuration, credentials and network; no automatic retry was made.' })] }; }
  };
  const register = (name, description, inputSchema, fn) => server.registerTool(name, {
    description, inputSchema, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, wrap(fn));
  server.registerTool('server_info', { description: 'Read PdhAPI configuration without revealing keys or contacting the provider.', inputSchema: {}, annotations: { readOnlyHint: true, openWorldHint: false } }, async () => ({ content: [text(publicInfo(config))] }));
  register('image_generate', 'Generate images using PdhAPI. This uses paid API quota. Returns local files and image previews. Do not retry automatically after a timeout.', { ...common, n },
    (args, signal) => api.queued(async () => render(await api.request(args, [], signal)), signal));
  register('image_edit', 'Edit one local PNG/JPEG/WebP through PdhAPI. The reference image is uploaded. Uses paid quota.', { ...common, n, image_path: z.string().min(1) },
    (args, signal) => api.queued(async () => render(await api.request(args, [await loadInput(args.image_path, config)], signal)), signal));
  register('image_multi_reference', 'Generate an image from 2-10 local reference images, uploaded together. Uses paid quota.', { ...common, image_paths: z.array(z.string().min(1)).min(2).max(10) },
    (args, signal) => api.queued(async () => {
      const inputs = [];
      for (const file of args.image_paths) inputs.push(await loadInput(file, config));
      return render(await api.request({ ...args, n: 1 }, inputs, signal));
    }, signal));
  register('image_batch_edit', 'Edit up to 10 local images sequentially with one prompt. Each image uses paid quota. Stops on first failure and reports completed files.', { ...common, image_paths: z.array(z.string().min(1)).min(1).max(10) },
    (args, signal) => api.queued(async () => {
      const inputs = [];
      for (const file of args.image_paths) inputs.push(await loadInput(file, config));
      const results = [];
      for (let i = 0; i < inputs.length; i++) {
        try { const result = await api.request({ ...args, n: 1 }, [inputs[i]], signal); results.push({ index: i, model: result.model, requested_size: result.requested_size, saved: result.saved, warnings: result.warnings }); }
        catch (error) { return { isError: true, content: [text({ completed: results, failed_index: i, error: error instanceof UserError ? error.message : 'Batch stopped. Check credentials and usage before retrying.' })] }; }
      }
      return { content: [text({ completed: results })] };
    }, signal));
  return server;
}
