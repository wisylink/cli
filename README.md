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
| `--json` | `boolean` | JSON on stdout, errors as JSON on stderr; no spinners (see [Output](#output)) |
| `--timeout <ms>` | `number` | Request timeout (`1000..120000`). Default `30000`; a chat turn defaults to `120000` |
| `--help` | `boolean` | Show command help |
| `--version` | `boolean` | Show installed CLI version |

## Output

- On a terminal the CLI prints readable text: spinners, the session and preview links, build reports.
- `--json` prints the result as one JSON object on stdout and errors as a JSON object on stderr, with no spinners or prompts. Use it in scripts and CI. It takes no value and works before or after the command.
- `files` and `links` commands also print JSON on their own when stdin or stdout is not a terminal. `chat` prints text unless `--json` is given.
- Versions before 0.3 printed JSON only and rejected `--json`. A script that reads `chat` output must add `--json` when it moves to 0.3 or later.

## Rules

| Rule | Value |
| --- | --- |
| File id format | 24-char hex (e.g. `67e6f6e6c5a91e4d2d9b0a11`) |
| Link id format | 6 chars, lowercase `a-z0-9` (e.g. `k3x9a2`) |
| Max file_ids per chat | `10` |
| Message max length | `5000` chars (after trimming) |

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

Continue a link (one-shot, or without `--message` to open the REPL on it):

```bash
wisylink chat --link-id k3x9a2 --message "Make the hero darker."
wisylink chat --link-id k3x9a2
```

After each turn the CLI prints the session URL (`https://wisylink.com/chat/<id>`) and the hosted preview URL.

- **Login session:** while a build is running the CLI polls its status, animates the live report, and **Ctrl+C** stops the build. A build waiting behind another one for the same link shows as `queued`; the CLI keeps waiting.
- **API key:** the CLI prints the build notice and returns. Check later with `wisylink links get <link-id>`; `status` is one of `building`, `queued`, `completed`, `aborted`, `idle`.

Automation:

```bash
wisylink chat --message "…" --api-key "$WISYLINK_API_KEY" --json
```

The JSON has `id`, `url`, `status`, `answer`, `created_at`, `updated_at` and `session_url` with an API key; with a login session it has `id`, `url`, `session_url`, `building` and `answer`, plus `rejected_files` when a file was left off because it would exceed your storage quota.

### Files

```bash
wisylink files upload "./asset.png"
wisylink files get 67e6f6e6c5a91e4d2d9b0a11
wisylink files delete 67e6f6e6c5a91e4d2d9b0a11
```

Uploads use `<=4 MB` chunks (up to `25 MB` total). The file type is read from the file's content, not its name. Works with a login session or an API key.

### Links

```bash
wisylink links list --page 1 --limit 20
wisylink links get k3x9a2
wisylink links delete k3x9a2
```

`--limit` is `1..100` (default `20`) with an API key; a login session returns at most `25` links per page.

## Node client

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const result = await client.chat({
  message: "Build a landing page for Ember Coffee.",
  fileIds: ["<file-id>"],
});
console.log(result); // { id, url, status, answer, created_at, updated_at }

// Continue the link, then list, read and delete links by their 6-character id.
await client.chat({ message: "Make the hero darker.", linkId: result.id });
const { items } = await client.listLinks({ page: 1, limit: 20 });
await client.getLink("k3x9a2");
await client.deleteLink("k3x9a2");
```

Methods throw before sending a request when an id, the message (1..5000 characters) or the file id list (at most 10) is invalid.

## Security Notes

- Session tokens live only in `~/.config/wisylink/credentials.json` (mode `0600`).
- API keys from `WISYLINK_API_KEY` / `--api-key` are never echoed or logged.
- All requests go over HTTPS to `https://api.wisylink.com`.
- Use `--json` in CI so output stays machine-readable with no TTY animations (see [Output](#output)).
