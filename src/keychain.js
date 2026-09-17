import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateApiKey } from './validate.js';
import { CliError } from './errors.js';

const execFileAsync = promisify(execFile);
const DEFAULT_SERVICE = 'pdhapi-image-mcp';
const DEFAULT_ACCOUNT = 'api-key';
const MAX_BUFFER = 65536;
const TIMEOUT_MS = 10000;

export function keychainSupported() {
  return ['darwin', 'win32', 'linux'].includes(process.platform);
}

function getCredentialId(service = DEFAULT_SERVICE, account = DEFAULT_ACCOUNT) {
  return { service, account };
}

async function run(cmd, args) {
  return execFileAsync(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
}

// execFile's `input` option is only honored by the *Sync variants; the async
// version silently ignores it. Any command that must receive the key via
// stdin (PowerShell, secret-tool) needs a real pipe, written and ended by hand.
async function runWithStdin(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => { child.kill(); }, TIMEOUT_MS);
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); fn(arg); };
    child.stdout.setEncoding('utf8').on('data', (d) => { if (stdout.length < MAX_BUFFER) stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { if (stderr.length < MAX_BUFFER) stderr += d; });
    child.on('error', (err) => finish(reject, err));
    child.on('close', (code, signal) => {
      if (code === 0) { finish(resolve, { stdout, stderr }); return; }
      const err = new Error(`Command failed: ${cmd} ${args.join(' ')}\n${stderr}`);
      err.code = code; err.signal = signal; err.stdout = stdout; err.stderr = stderr;
      finish(reject, err);
    });
    // If the child exits before consuming stdin (e.g. immediate failure), writing
    // to its closed pipe raises EPIPE; the 'close' handler above already reports
    // the real failure, so this is purely to prevent an unhandled 'error' event.
    child.stdin.on('error', () => {});
    child.stdin.end(input !== undefined ? input : '', 'utf8');
  });
}

async function runPowerShellScript(script, input) {
  const tmpFile = join(tmpdir(), `pdhapi-${randomUUID()}.ps1`);
  try {
    await writeFile(tmpFile, script, 'utf8');
    return await runWithStdin('powershell.exe', ['-NonInteractive', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], input);
  } finally {
    try { await unlink(tmpFile); } catch {}
  }
}

export async function keychainSet(password, options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);
  const validKey = validateApiKey(password);
  if (process.platform === 'darwin') {
    await runWithStdin('security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w'], validKey);
    return;
  }
  if (process.platform === 'win32') {
    const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
}
'@
$password = [Console]::In.ReadToEnd()
$passwordBytes = [Text.Encoding]::Unicode.GetBytes($password)
$passwordPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal($passwordBytes.Length)
[Runtime.InteropServices.Marshal]::Copy($passwordBytes, 0, $passwordPtr, $passwordBytes.Length)
$cred = New-Object CredMan+CREDENTIAL
$cred.Type = 1
$cred.TargetName = '${service}:${account}'
$cred.UserName = '${account}'
$cred.CredentialBlob = $passwordPtr
$cred.CredentialBlobSize = $passwordBytes.Length
$cred.Persist = 2
$cred.AttributeCount = 0
$cred.Attributes = [IntPtr]::Zero
try {
  if (-not [CredMan]::CredWriteW([ref]$cred, 0)) {
    throw "CredWriteW failed with error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  $verifyPtr = [IntPtr]::Zero
  if (-not [CredMan]::CredReadW($cred.TargetName, 1, 0, [ref]$verifyPtr)) {
    throw "Write verification failed: CredReadW returned error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  [CredMan]::CredFree($verifyPtr)
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($passwordPtr)
  [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
}
`;
    await runPowerShellScript(script, validKey);
    return;
  }
  if (process.platform === 'linux') {
    await runWithStdin('secret-tool', ['store', '--label', 'PdhAPI API Key', 'service', service, 'account', account], validKey);
    return;
  }
  throw new Error('Credential manager is not supported on this platform.');
}

export async function keychainGet(options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await run('security', ['find-generic-password', '-s', service, '-a', account, '-w']);
      const key = stdout.trim();
      if (!key) throw new Error();
      return key;
    }
    if (process.platform === 'win32') {
      const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr cred);
}
'@
$credPtr = [IntPtr]::Zero
if (-not [CredMan]::CredReadW('${service}:${account}', 1, 0, [ref]$credPtr)) {
  exit 1
}
try {
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [Type][CredMan+CREDENTIAL])
  $password = [Runtime.InteropServices.Marshal]::PtrToStringUni($cred.CredentialBlob, $cred.CredentialBlobSize / 2)
  [Console]::Out.Write($password)
} finally {
  [CredMan]::CredFree($credPtr)
}
`;
      const { stdout } = await runPowerShellScript(script);
      if (!stdout) throw new Error();
      return stdout;
    }
    if (process.platform === 'linux') {
      const { stdout } = await run('secret-tool', ['lookup', 'service', service, 'account', account]);
      if (!stdout) throw new Error();
      return stdout;
    }
  } catch {
    throw new CliError('Key not found in system credential manager. Run: pdhapi-image-mcp keychain set');
  }
  throw new CliError('Credential manager is not supported on this platform.');
}

// Best-effort check for whether the credential still exists, used to make
// delete idempotent on platforms whose CLI tools report "not found" with
// exit codes/messages that vary across tool versions (darwin `security`,
// linux `secret-tool`). Windows uses CredDeleteW's own Win32 error code
// (1168 = ERROR_NOT_FOUND) instead, which is stable and checked inline below.
async function credentialStillExists(service, account) {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await run('security', ['find-generic-password', '-s', service, '-a', account, '-w']);
      return Boolean(stdout.trim());
    }
    if (process.platform === 'linux') {
      const { stdout } = await run('secret-tool', ['lookup', 'service', service, 'account', account]);
      return Boolean(stdout);
    }
  } catch {
    return false;
  }
  return false;
}

export async function keychainDelete(options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);
  try {
    if (process.platform === 'darwin') {
      try { await run('security', ['delete-generic-password', '-s', service, '-a', account]); }
      catch (e) { if (await credentialStillExists(service, account)) throw e; }
      return;
    }
    if (process.platform === 'win32') {
      const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CredMan {
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDeleteW(string target, uint type, uint flags);
}
'@
if (-not [CredMan]::CredDeleteW('${service}:${account}', 1, 0)) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($err -ne 1168) {
    exit 1
  }
}
`;
      await runPowerShellScript(script);
      return;
    }
    if (process.platform === 'linux') {
      try { await run('secret-tool', ['clear', 'service', service, 'account', account]); }
      catch (e) { if (await credentialStillExists(service, account)) throw e; }
      return;
    }
  } catch {
    throw new CliError('Key not found in credential manager or could not be deleted.');
  }
  throw new CliError('Credential manager is not supported on this platform.');
}
