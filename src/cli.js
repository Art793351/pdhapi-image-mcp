#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { loadConfig, publicInfo, getKey, VERSION } from './config.js';
import { install, configDocument, serialize } from './install.js';
import { keychainSet, keychainGet, keychainDelete, keychainSupported } from './keychain.js';
import { CliError } from './errors.js';
import { stripTrailingNewline } from './validate.js';

async function readStdin() {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return stripTrailingNewline(Buffer.concat(chunks).toString('utf8'));
  }
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    let buffer = '';
    const cleanup = () => {
      try {
        if (stdin.isTTY) stdin.setRawMode(false);
      } catch {}
      stdin.pause();
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      process.removeListener('SIGINT', onSigInt);
    };
    const onData = chunk => {
      for (const byte of chunk) {
        if (byte === 0x03) {
          cleanup();
          reject(new Error('Interrupted'));
          return;
        }
        if (byte === 0x0d || byte === 0x0a) {
          cleanup();
          resolve(buffer);
          return;
        }
        if (byte === 0x7f || byte === 0x08) {
          if (buffer.length > 0) buffer = buffer.slice(0, -1);
        } else if (byte >= 0x20 && byte < 0x7f) {
          buffer += String.fromCharCode(byte);
        }
      }
    };
    const onEnd = () => { cleanup(); resolve(buffer); };
    const onError = err => { cleanup(); reject(err); };
    const onSigInt = () => { cleanup(); reject(new Error('Interrupted')); };
    try {
      stdin.setRawMode(true);
      stderr.write('Enter PdhAPI key (input hidden): ');
      stdin.resume();
      stdin.on('data', onData);
      stdin.on('end', onEnd);
      stdin.on('error', onError);
      process.on('SIGINT', onSigInt);
    } catch (err) {
      cleanup();
      reject(err);
    }
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
    // Internal test hook only: lets the test suite isolate keychain reads/writes
    // from the real, default credential entry. Not a documented user-facing flag.
    const keychainOptions = process.env.PDHAPI_TEST_KEYCHAIN_SERVICE
      ? { service: process.env.PDHAPI_TEST_KEYCHAIN_SERVICE, account: process.env.PDHAPI_TEST_KEYCHAIN_ACCOUNT }
      : undefined;
    if (subcommand === 'set') {
      const key = await readStdin();
      if (!key) throw new Error('No key provided.');
      await keychainSet(key, keychainOptions);
      console.log('Key saved to system credential manager.');
    } else if (subcommand === 'get') {
      await keychainGet(keychainOptions);
      console.log('Key is readable from system credential manager.');
    } else if (subcommand === 'delete') {
      await keychainDelete(keychainOptions);
      console.log('Key removed from system credential manager.');
    } else throw new Error('Usage: pdhapi-image-mcp keychain [set|get|delete]');
  }
  else if (command === 'config') console.log(serialize(values.client, configDocument(values.client, options)));
  else if (command === 'install') {
    const hasKeySource = options.keyFile || options.keychain || process.env.PDHAPI_API_KEY;
    let resolvedOptions = options;
    if (!hasKeySource && process.stdin.isTTY && process.stderr.isTTY) {
      process.stderr.write('No API key configured. Would you like to enter your PdhAPI key now? (y/n): ');
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      const answer = await new Promise(resolve => rl.question('', resolve));
      rl.close();
      if (answer.trim().toLowerCase() === 'y') {
        const key = await readStdin();
        if (key) {
          if (keychainSupported()) {
            process.stderr.write('\nSave to system credential manager? (y/n): ');
            const rl2 = createInterface({ input: process.stdin, output: process.stderr });
            const saveAnswer = await new Promise(resolve => rl2.question('', resolve));
            rl2.close();
            if (saveAnswer.trim().toLowerCase() === 'y') {
              await keychainSet(key);
              resolvedOptions = { ...options, keychain: true };
              console.log('Key saved to system credential manager.');
            } else {
              console.log('Key not saved. Set PDHAPI_API_KEY or PDHAPI_API_KEY_FILE to use this server.');
            }
          } else {
            console.log('System credential manager not supported. Set PDHAPI_API_KEY or PDHAPI_API_KEY_FILE.');
          }
        }
      }
    }
    const result = await install(values.client, resolvedOptions);
    console.log(JSON.stringify(result, null, 2));
  }
  else if (command === 'doctor') {
    const config = loadConfig(); let ready = false;
    try { await getKey(config); ready = true; } catch {}
    console.log(JSON.stringify({ ...publicInfo(config), local_key_readable: ready, network_tested: false }, null, 2));
    if (!ready) process.exitCode = 2;
  } else if (command === 'serve') await createServer(loadConfig()).connect(new StdioServerTransport());
  else throw new Error('Unknown command; run with --help.');
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
  } else {
    console.error('PdhAPI MCP could not start or update configuration. Check arguments, configuration syntax, permissions and installation locks. No credentials are printed.');
  }
  process.exitCode = 1;
}
