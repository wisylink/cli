# WisyLink CLI

[![npm version](https://img.shields.io/npm/v/@wisylink/cli.svg)](https://www.npmjs.com/package/@wisylink/cli) [![npm downloads](https://img.shields.io/npm/dm/@wisylink/cli.svg)](https://www.npmjs.com/package/@wisylink/cli) [![license](https://img.shields.io/npm/l/@wisylink/cli.svg)](https://github.com/wisylink/cli/blob/main/LICENSE)

Official coding-agent CLI for WisyLink — device login, interactive chat, live build previews, files, and links.

Built with ❤️ by our team

## Availability

```bash
npm i -g @wisylink/cli
```

## Authentication

### Interactive (recommended)

```bash
wisylink login
```

Opens a browser device-authorization flow (`https://wisylink.com/cli/authorize`). Credentials are stored at `~/.config/wisylink/credentials.json` with mode `0600`. Works for every plan, including Community.

```bash
wisylink whoami
wisylink logout
```

### Automation / CI

API keys still work for scripts. Usage bills against your subscription limits.

```bash
export WISYLINK_API_KEY="your_api_key"
# or
wisylink links list --api-key "your_api_key" --json
```

## Global Flags

| Flag | Type | Description |
| --- | --- | --- |
| `--api-key <value>` | `string` | Override `WISYLINK_API_KEY` (automation) |
| `--json` | `boolean` | Machine-readable JSON output |
| `--timeout <ms>` | `number` | Request timeout (`1000..120000`) |
| `--help` | `boolean` | Show command help |
| `--version` | `boolean` | Show installed CLI version |

## Rules

| Rule | Value |
| --- | --- |
| File id format | 24-char hex |
| Link id format | 24-char hex |
| Max file_ids per chat | `10` |
| Message max length | `5000` chars |

## Commands

### Auth

```bash
wisylink login
wisylink logout
wisylink whoami
```

### Chat

Interactive REPL (TTY):

```bash
wisylink chat
```

One-shot:

```bash
wisylink chat --message "Build a landing page for Ember Coffee." --file-id 67e6f6e6c5a91e4d2d9b0a11
```

Continue a session:

```bash
wisylink chat --link-id 67e6f6e6c5a91e4d2d9b0a77 --message "Make the hero darker."
```

After each turn the CLI prints the session URL (`https://wisylink.com/chat/<id>`) and the hosted preview URL. While a build is running it polls status, animates the live report, and **Ctrl+C** stops the build.

Automation:

```bash
wisylink chat --message "…" --api-key "$WISYLINK_API_KEY" --json
```

### Files

```bash
wisylink files upload "./asset.png"
wisylink files get 67e6f6e6c5a91e4d2d9b0a11
wisylink files delete 67e6f6e6c5a91e4d2d9b0a11
```

Uploads use `<=4 MB` chunks (up to `25 MB` total). Works with a login session or an API key.

### Links

```bash
wisylink links list --page 1 --limit 20
wisylink links get 67e6f6e6c5a91e4d2d9b0a77
wisylink links delete 67e6f6e6c5a91e4d2d9b0a77
```

## Node client

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const result = await client.chat({
  message: "Build a landing page for Ember Coffee.",
  fileIds: ["<file-id>"],
});
console.log(result);
```

## Security Notes

- Session tokens live only in `~/.config/wisylink/credentials.json` (mode `0600`).
- API keys from `WISYLINK_API_KEY` / `--api-key` are never echoed or logged.
- All requests go over HTTPS to `https://api.wisylink.com`.
- Use `--json` in CI so output stays machine-readable with no TTY animations.
