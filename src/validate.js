import { CliError } from './errors.js';

// Strips exactly one trailing newline (LF or CRLF), the artifact editors and
// `echo`/Write-Output add. Any other leading/trailing whitespace is left for
// validateApiKey to reject explicitly, rather than silently trimmed away.
export function stripTrailingNewline(value) {
  return value.replace(/\r?\n$/, '');
}

export function validateApiKey(key) {
  if (typeof key !== 'string') throw new CliError('Key must be a string.');
  if (/[\r\n]/.test(key)) throw new CliError('Key must be a single line with no line breaks.');
  if (!key) throw new CliError('Key must not be empty.');
  if (key !== key.trim()) throw new CliError('Key must not have leading or trailing whitespace.');
  if (key.length < 8 || key.length > 512) throw new CliError('Key must be 8-512 characters long.');
  if (!/^[\x21-\x7e]+$/.test(key)) throw new CliError('Key must contain only printable ASCII characters, no spaces.');
  return key;
}
