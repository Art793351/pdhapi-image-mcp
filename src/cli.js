#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { loadConfig, publicInfo, getKey, VERSION } from './config.js';
import { install, configDocument, serialize } from './install.js';

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    client: { type: 'string', default: 'codex' }, config: { type: 'string' },
    'key-file': { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' }
  } });
  const command = values.help ? 'help' : positionals[0] || 'serve';
  const options = { config: values.config, keyFile: values['key-file'], output: values.output };
  if (positionals.length > 1) throw new Error('Unexpected positional argument.');
  if (command === 'version') console.log(VERSION);
  else if (command === 'help') console.log(`PdhAPI Image MCP ${VERSION}
Usage: pdhapi-image-mcp [serve|doctor|version|config|install]
  config  --client codex|claude|cursor   Print a client config; do not modify files
  install --client codex|claude|cursor   Merge MCP config with a backup
          --config PATH                Override client config path
          --key-file PATH              Reference an existing private key file
          --output PATH                Set image output directory
  doctor                               Check local settings; no paid API requests
Set PDHAPI_API_KEY or PDHAPI_API_KEY_FILE before starting your MCP client.
The install command parses and reserializes the config; comments may be reformatted.
Keep this installed package in place while clients use it.`);
  else if (command === 'config') console.log(serialize(values.client, configDocument(values.client, options)));
  else if (command === 'install') console.log(JSON.stringify(await install(values.client, options), null, 2));
  else if (command === 'doctor') {
    const config = loadConfig(); let ready = false;
    try { await getKey(config); ready = true; } catch {}
    console.log(JSON.stringify({ ...publicInfo(config), local_key_readable: ready, network_tested: false }, null, 2));
    if (!ready) process.exitCode = 2;
  } else if (command === 'serve') await createServer(loadConfig()).connect(new StdioServerTransport());
  else throw new Error('Unknown command; run with --help.');
} catch {
  console.error('PdhAPI MCP could not start or update configuration. Check arguments, configuration syntax, permissions and installation locks. No credentials are printed.');
  process.exitCode = 1;
}
