import { AsyncEntry } from '@napi-rs/keyring';
import { validateApiKey } from './validate.js';
import { CliError } from './errors.js';

const DEFAULT_SERVICE = 'pdhapi-image-mcp';
const DEFAULT_ACCOUNT = 'api-key';

export function keychainSupported() {
  return ['darwin', 'win32', 'linux'].includes(process.platform);
}

function getCredentialId(service = DEFAULT_SERVICE, account = DEFAULT_ACCOUNT) {
  return { service, account };
}

function buildEntryOptions() {
  // Linux: explicitly use secret-service to avoid keyutils (session-only, lost on reboot)
  if (process.platform === 'linux') {
    return { linux: { store: 'secret-service' } };
  }
  return undefined;
}

export async function keychainSet(password, options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);
  const validKey = validateApiKey(password);

  try {
    const entry = new AsyncEntry(service, account, buildEntryOptions());
    await entry.setPassword(validKey);

    // Verify write with immediate read
    const retrieved = await entry.getPassword();
    if (retrieved !== validKey) {
      throw new Error('Write verification failed: retrieved password does not match');
    }
  } catch (e) {
    throw new CliError(`Failed to save key to system credential manager: ${e.message}`);
  }
}

export async function keychainGet(options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);

  try {
    const entry = new AsyncEntry(service, account, buildEntryOptions());
    const password = await entry.getPassword();
    if (!password) {
      throw new Error('Retrieved password is empty');
    }
    return password;
  } catch (e) {
    throw new CliError('Key not found in system credential manager. Run: pdhapi-image-mcp keychain set');
  }
}

export async function keychainDelete(options = {}) {
  const { service, account } = getCredentialId(options.service, options.account);

  try {
    const entry = new AsyncEntry(service, account, buildEntryOptions());
    // deletePassword returns true if deleted, false if didn't exist — naturally idempotent
    await entry.deletePassword();
  } catch (e) {
    throw new CliError(`Failed to delete key from credential manager: ${e.message}`);
  }
}

