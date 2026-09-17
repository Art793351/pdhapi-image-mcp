import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SERVICE = 'pdhapi-image-mcp';
const ACCOUNT = 'api-key';

export function keychainSupported() {
  return ['darwin', 'win32', 'linux'].includes(process.platform);
}

async function run(cmd, args, input) {
  const opts = { timeout: 10000, maxBuffer: 65536 };
  if (input !== undefined) { opts.input = input; opts.encoding = 'utf8'; }
  return execFileAsync(cmd, args, opts);
}

export async function keychainSet(password) {
  if (!password || /[\r\n]/.test(password)) throw new Error('Key must be a single non-empty line with no line breaks.');
  if (process.platform === 'darwin') {
    await run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', password]);
    return;
  }
  if (process.platform === 'win32') {
    const script = [
      '$p=[Console]::In.ReadLine()',
      `$vault=New-Object Windows.Security.Credentials.PasswordVault`,
      `$vault.Add((New-Object Windows.Security.Credentials.PasswordCredential('${SERVICE}','${ACCOUNT}',$p)))`,
    ].join(';');
    await run('powershell', ['-NonInteractive', '-NoProfile', '-Command', script], password);
    return;
  }
  if (process.platform === 'linux') {
    await run('secret-tool', ['store', '--label', 'PdhAPI API Key', 'service', SERVICE, 'account', ACCOUNT], password);
    return;
  }
  throw new Error('Credential manager is not supported on this platform.');
}

export async function keychainGet() {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await run('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w']);
      const key = stdout.trim();
      if (!key) throw new Error();
      return key;
    }
    if (process.platform === 'win32') {
      const script = [
        `$vault=New-Object Windows.Security.Credentials.PasswordVault`,
        `$c=$vault.Retrieve('${SERVICE}','${ACCOUNT}')`,
        `$c.RetrievePassword()`,
        `Write-Output $c.Password`,
      ].join(';');
      const { stdout } = await run('powershell', ['-NonInteractive', '-NoProfile', '-Command', script]);
      const key = stdout.trim();
      if (!key) throw new Error();
      return key;
    }
    if (process.platform === 'linux') {
      const { stdout } = await run('secret-tool', ['lookup', 'service', SERVICE, 'account', ACCOUNT]);
      const key = stdout.trim();
      if (!key) throw new Error();
      return key;
    }
  } catch {
    throw new Error('Key not found in system credential manager. Run: pdhapi-image-mcp keychain set');
  }
  throw new Error('Credential manager is not supported on this platform.');
}

export async function keychainDelete() {
  try {
    if (process.platform === 'darwin') {
      await run('security', ['delete-generic-password', '-s', SERVICE, '-a', ACCOUNT]);
      return;
    }
    if (process.platform === 'win32') {
      const script = [
        `$vault=New-Object Windows.Security.Credentials.PasswordVault`,
        `$c=$vault.Retrieve('${SERVICE}','${ACCOUNT}')`,
        `$vault.Remove($c)`,
      ].join(';');
      await run('powershell', ['-NonInteractive', '-NoProfile', '-Command', script]);
      return;
    }
    if (process.platform === 'linux') {
      await run('secret-tool', ['clear', 'service', SERVICE, 'account', ACCOUNT]);
      return;
    }
  } catch {
    throw new Error('Key not found in credential manager or could not be deleted.');
  }
  throw new Error('Credential manager is not supported on this platform.');
}
