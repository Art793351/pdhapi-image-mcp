# Security

## Credential Storage

- **System credential managers** use native platform APIs:
  - Windows: Credential Manager (via Win32 APIs)
  - macOS: Keychain (via Security.framework)
  - Linux: Secret Service (via libsecret, requires GNOME Keyring, KWallet, or KeePassXC)

- Keys never appear in:
  - Client configuration files
  - Command-line arguments
  - Process environment listings
  - Log files

## Network Security

- **Private address blocking**: Requests to private IP ranges (RFC 1918, loopback, link-local) are rejected
- **Redirect refusal**: HTTP redirects are not followed when authorization headers are present
- **CDN downloads**: Image downloads from CDN URLs omit authorization headers

## Input Validation

- API keys: 8–512 printable ASCII characters, single line, no whitespace
- Reference images: PNG/JPEG/WebP only, max 30 MiB per file, max 16 megapixels
- Image paths: Symlink escape and parent-directory traversal checks when `PDHAPI_INPUT_ROOT` is set

## Reporting Vulnerabilities

Report security issues to the [GitHub issue tracker](https://github.com/Art793351/pdhapi-image-mcp/issues). Please include:

- Affected version
- Detailed description
- Steps to reproduce

Do not include real API keys, account identifiers, or production credentials in reports.
