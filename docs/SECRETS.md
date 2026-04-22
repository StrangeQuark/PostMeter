# Secret Storage And Recovery

PostMeter is a standalone local desktop app. It does not have a PostMeter account, login, cloud vault, or server-side secret recovery.

## What PostMeter Encrypts Locally

PostMeter encrypts these values in the local workspace file:

- Auth tokens, passwords, client secrets, and certificate passphrases.
- Collection, environment, and request-local variables marked `Secret`.
- Workspace cookie values.

When Electron `safeStorage` is available, encryption is tied to the host operating system's keyring or login session. When `safeStorage` is unavailable, PostMeter uses the fallback passphrase you enter to encrypt secrets with AES-256-GCM.

## What Cannot Be Recovered

PostMeter cannot recover exact secret values if:

- The OS keyring or login session that protected `safeStorage` values is no longer available.
- You forget the fallback passphrase used for passphrase-protected workspace secrets.
- You only have a redacted export.

In those cases, restore access to the original OS keyring/session, restore a backup that still decrypts, or re-enter the affected tokens/passwords manually.

## Redacted Exports

Redacted exports are the safe default. They are portable and do not include exact secret values. Use them for sharing collections, issues, examples, and most backups.

## Exact Exports

Exact exports write tokens, passwords, marked secret variables, cookie values, and certificate passphrases into the exported JSON. They are useful only when you intentionally need a portable copy with exact values, such as an offline backup or controlled CI fixture.

Exact exports are not encrypted by PostMeter after export. Store them in your own encrypted backup system and delete them when no longer needed.

## Troubleshooting

- `safeStorage is not available`: unlock or configure your OS keyring/secret service, or use the fallback passphrase prompt.
- `Secret value could not be decrypted`: enter the same fallback passphrase that protected this workspace, or restore the original OS keyring/session.
- Workspace opens but secret values are redacted/missing in an export: that is expected for redacted exports. Use exact export only when you intentionally need plaintext values.
- Moving a workspace between machines: use redacted exports for normal sharing. Use exact exports only with separate encryption and access control.
