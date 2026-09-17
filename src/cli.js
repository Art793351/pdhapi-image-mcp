#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { loadConfig, publicInfo, getKey, VERSION } from './config.js';
import { install, configDocument, serialize } from './install.js';
import { keychainSet, keychainGet, keychainDelete, keychainSupported } from './keychain.js';

async function readStdin() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write('Enter PdhAPI key (input hidden): ');
    rl.question('', key => { rl.close(); resolve(key.trim()); });
    rl.on('error', reject);
  });
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    client: { type: 'string', default: 'codex' }, config: { type: 'string' },
    'key-file': { type: 'string' }, keychain: { type: 'boolean' },
    output: { type: 'string' }, help: { type: 'boolean' }
  } });
  const command = values.help ? 'help' : positionals[0] || 'serve';
  const subcommand = positionals[1];
  const options = { config: values.config, keyFile: values['key-file'], keychain: values.keychain, output: values.output };
  if (positionals.length > 2) throw new Error('Unexpected positional argument.');
  if (command === 'version') console.log(VERSION);
  else if (command === 'help') console.log(`PdhAPI Image MCP ${VERSION}
Usage: pdhapi-image-mcp [serve|doctor|version|config|install|keychain]
  config   --client codex|claude|cursor   Print a client config; do not modify files
  install  --client codex|claude|cursor   Merge MCP config with a backup
           --config PATH                  Override client config path
           --key-file PATH                Reference an existing private key file
           --keychain                     Use system credential manager for the key
           --output PATH                  Set image output directory
  keychain set                            Save key to system credential manager (reads from stdin)
  keychain get                            Verify key is readable from credential manager
  keychain delete                         Remove key from system credential manager
  doctor                                  Check local settings; no paid API requests
Set PDHAPI_API_KEY, PDHAPI_API_KEY_FILE, or PDHAPI_API_KEY_KEYCHAIN=true before starting your MCP client.
The install command parses and reserializes the config; comments may be reformatted.
Keep this installed package in place while clients use it.`);
  else if (command === 'keychain') {
    if (!keychainSupported()) throw new Error('System credential manager is not supported on this platform.');
    if (subcommand === 'set') {
      const key = await readStdin();
      if (!key) throw new Error('No key provided.');
      await keychainSet(key);
      console.log('Key saved to system credential manager.');
    } else if (subcommand === 'get') {
      await keychainGet();
      console.log('Key is readable from system credential manager.');
    } else if (subcommand === 'delete') {
      await keychainDelete();
      console.log('Key removed from system credential manager.');
    } else throw new Error('Usage: pdhapi-image-mcp keychain [set|get|delete]');
  }
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
