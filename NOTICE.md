# Reference and Dependencies

The feature set was inspired by [Subaru486desuwa/micu-image-mcp](https://github.com/Subaru486desuwa/micu-image-mcp).
This project is an independent JavaScript implementation for PdhAPI, not an official Micu release or a renamed copy of its Rust/Python implementation.

At inspection on 2026-09-16 the reference repository declared `license = "MIT"` in `Cargo.toml`, but did not contain a standalone license file. No reference source files, installers, images, or documentation were copied into this distribution.

This project's own source is MIT licensed. System credential storage is provided by `@napi-rs/keyring` and its platform-specific native packages. Third-party dependencies retain their respective licenses. Exact versions and package metadata are recorded in `package-lock.json`.
