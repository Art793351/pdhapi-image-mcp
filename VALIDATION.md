# 0.1.0 Validation

Updated: 2026-09-17 (Asia/Shanghai). Local environment: Windows, Node.js 24.14.0.

## Passed locally

- 27 automated tests, no failures or skips.
- JavaScript syntax checks for all runtime modules.
- MCP SDK initialization and tool discovery using a real stdio subprocess.
- MCP input validation and partial-batch failure reporting.
- JSON generation and multipart editing over a local HTTP server.
- Single-reference and multi-reference multipart field contracts.
- UTF-8 prompts, image decoding, original output and inline preview creation.
- Default model selection and explicit model preservation at 4K.
- URL normalization, authentication forwarding, redirect refusal.
- No automatic paid retries on timeout, 429 or 502.
- Response size limits and malformed image handling.
- Download host restrictions, private-address classification and omitted download credentials.
- Input root and symlink escape checks.
- Secret omission from public server information and provider errors.
- Codex, Claude and Cursor configuration merge, exact backups and invalid-file preservation.
- npm dependency audit: zero known vulnerabilities at installation time.
- npm package installed successfully into an isolated directory; packaged CLI version and Codex configuration commands passed.

## Not yet verified

- Authenticated editing and multi-reference calls to real PdhAPI upstreams; generation succeeded once as recorded below.
- Actual 1K/2K/4K output dimensions, quality variants and model-specific billing upstream.
- Actual PdhAPI CDN delivery with the intended user's channel and key.
- Desktop UI behavior in each target client; MCP protocol and configuration are locally tested.
- Node 22, Linux and macOS execution. GitHub Actions has a matrix ready, but has not run.
- GitHub Actions results and release assets must be verified on the repository before describing them as passed.

The public PdhAPI model list was checked separately during development. Presence in that list does not prove that an individual key can use a model.

## Live authentication check (2026-09-17)

With a user-provided key used only in temporary process memory, `GET /v1/models` returned HTTP 200 and listed the default Flare and Sunburst image models. One generation through the actual stdio MCP returned HTTP 403 in about 1.5 seconds, with no image or preview. A subsequent empty-prompt diagnostic returned `insufficient_user_quota`, confirming an account-balance rejection. No successful paid generation was observed and no automatic retry ran. Account identifiers, balances and keys are intentionally excluded from this public report.

To repeat after resolving balance, provide `PDHAPI_API_KEY` or `PDHAPI_API_KEY_FILE` and explicitly run `node scripts/smoke-live.mjs --paid-one-image`. This sends one paid generation and writes sanitized results into the ignored `outputs/` directory.

## Live generation success (2026-09-17)

A replacement user-provided key passed `GET /v1/models` and completed one `gpt-image-2.5-flare` generation through the real stdio MCP in 51.4 seconds. The output was saved locally and one WebP MCP preview was returned. Visual inspection confirmed the requested plain white ceramic cup photograph. The request was 1024x1024; actual PNG dimensions were 1254x1254 (1,468,251 bytes). The server now reports this mismatch explicitly and preserves the original image. No exact-size guarantee or billing amount has been verified.

No real keys, generated images, account identifiers or raw provider responses are included in the public package.

## Before public release

Run the configured CI matrix. With a dedicated PdhAPI test key, accept one generation, one edit and one multi-reference result; inspect the saved image, actual dimensions, latency and billing. Verify client restart and image preview behavior. Update README status and this report with observed results before tagging a stable release.

Use a dedicated test key with limited quota. Never put real keys, account logs, private reference images or production credentials in the repository.
