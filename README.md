# WisyLink CLI

[![npm version](https://img.shields.io/npm/v/@wisylink/cli.svg)](https://www.npmjs.com/package/@wisylink/cli) [![npm downloads](https://img.shields.io/npm/dm/@wisylink/cli.svg)](https://www.npmjs.com/package/@wisylink/cli) [![license](https://img.shields.io/npm/l/@wisylink/cli.svg)](https://github.com/wisylink/cli/blob/main/LICENSE)

Official CLI contract for WisyLink API operations.

Built with ❤️ by our team

## Availability

```bash
npm i -g @wisylink/cli
```

## Authentication

CLI requests use the same API key auth as the HTTP API.

Set your API key:

```bash
export WISYLINK_API_KEY="your_api_key"
```

Or pass per command:

```bash
wisylink links get 67e6f6e6c5a91e4d2d9b0a77 --api-key "your_api_key"
```

## Global Flags

| Flag | Type | Description |
| --- | --- | --- |
| `--api-key <value>` | `string` | Overrides `WISYLINK_API_KEY` |
| `--timeout <ms>` | `number` | Request timeout (`1000..120000`) |
| `--help` | `boolean` | Show command help |
| `--version` | `boolean` | Show installed CLI version |

## Rules

| Rule | Value |
| --- | --- |
| File id format | 24-char hex |
| Link id format | 24-char hex |
| Max file_ids per link request | `10` |
| Message max length | `5000` chars |

## Commands

CLI command reference grouped by resource. Each command maps directly to an HTTP API endpoint.

### Files

Upload, inspect, and delete file assets that can be attached to link generation.

#### Upload File

(wisylink files upload <path>)

Maps to chunk upload flow:

- `POST /files`
- `POST /files/chunks?id=...`

CLI uploads in `<=4 MB` chunks automatically (up to `25 MB` total file size).
The final chunk is sent with `last=true`.

Example:

```bash
wisylink files upload "./asset.png"
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const file = await client.uploadFile("./asset.png");
console.log(file);
```

Success output:

```json
{
  "id": "67e6f6e6c5a91e4d2d9b0a11",
  "ok": true
}
```

#### Get File

(wisylink files get <id>)

Maps to `GET /files/:id`.

Example:

```bash
wisylink files get 67e6f6e6c5a91e4d2d9b0a11
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const file = await client.getFile("<file-id>");
console.log(file);
```

#### Delete File

(wisylink files delete <id>)

Maps to `DELETE /files/:id`.

Example:

```bash
wisylink files delete 67e6f6e6c5a91e4d2d9b0a11
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const result = await client.deleteFile("<file-id>");
console.log(result);
```

Success output:

```json
{
  "ok": true
}
```

### Links

Every link is a hosted page built from a message. Create or continue a link via chat, then read or delete it.

#### Chat

(wisylink links chat --message <text> [--file-id <id>...] [--link-id <id>])

Maps to `POST /links`. Describe what you want and Wisy builds it into a hosted page. Omit `--link-id` to start a new link; pass it to continue an existing one — conversation history is kept server-side per link.

Arguments:

| Flag | Type | Required | Rules |
| --- | --- | --- | --- |
| `--message` | `string` | Yes | 1..5000 chars |
| `--file-id` | `string` | No | Repeatable flag, max 10 total |
| `--link-id` | `string` | No | 24-char hex; continue an existing link |

Example:

```bash
wisylink links chat \
  --message "Build a landing page for a specialty coffee shop called Ember." \
  --file-id 67e6f6e6c5a91e4d2d9b0a11
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const result = await client.chat({
  message: "Build a landing page for a specialty coffee shop called Ember.",
  fileIds: ["<file-id>"],
  // linkId: "<link-id>",   // continue an existing link
});
console.log(result);
```

Success output:

```json
{
  "id": "67e6f6e6c5a91e4d2d9b0a77",
  "url": "https://wisylink.com/67e6f6e6c5a91e4d2d9b0a77",
  "answer": "On it — building your coffee shop landing page now.",
  "created_at": 1762432496000,
  "updated_at": 1762432496000
}
```

`answer` is Wisy's short reply; the hosted `url` goes live once the build finishes.

#### Get Link

(wisylink links get <id>)

Maps to `GET /links/:id`. Response includes `id`, `url` (the hosted page), `meta` (`title`, `description`), `file_ids`, and timestamps.

Example:

```bash
wisylink links get 67e6f6e6c5a91e4d2d9b0a77
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const link = await client.getLink("<link-id>");
console.log(link);
```

#### Delete Link

(wisylink links delete <id>)

Maps to `DELETE /links/:id`.

Example:

```bash
wisylink links delete 67e6f6e6c5a91e4d2d9b0a77
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const result = await client.deleteLink("<link-id>");
console.log(result);
```

Success output:

```json
{
  "ok": true
}
```

## Output

All command outputs are root-level JSON objects aligned with API responses.

## Security Notes

- Your API key is read from `WISYLINK_API_KEY` or `--api-key` and is never echoed, logged, or written to any output stream.
- All requests go over HTTPS to `https://wisylink.com/api`.
- Command output is JSON-only; no debug traces, stack frames, or credential leaks are printed.
- Keep your API key out of shell history and version control. Use an environment variable or a secret manager.
