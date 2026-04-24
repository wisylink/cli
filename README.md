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
| Prompt max length | `5000` chars |
| Link statuses | `pending`, `generating`, `completed`, `error` |

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

Create, read, update, and delete links backed by the WisyLink API.

#### Create Link

(wisylink links create --type <type> --prompt <prompt>)

Maps to `POST /links`.

Rules:
- Endpoint prefix (Linkbase) must be configured before link creation.
- New links are created with `status: pending`.

Arguments:

| Flag | Type | Required | Rules |
| --- | --- | --- | --- |
| `--type` | `string` | Yes | `image`, `audio`, `video`, `pdf`, `page` |
| `--prompt` | `string` | Yes | 1..5000 chars |
| `--hosted` | `boolean` | No | Defaults to `false` |
| `--private` | `boolean` | No | Defaults to `false` |
| `--file-id` | `string` | No | Repeatable flag, max 10 total |

Example:

```bash
wisylink links create \
  --type "video" \
  --prompt "Create a short product trailer with energetic pacing." \
  --hosted true \
  --private true \
  --file-id 67e6f6e6c5a91e4d2d9b0a11 \
  --file-id 67e6f6e6c5a91e4d2d9b0a22
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const link = await client.createLink({
  type: "video",
  prompt: "Create a short product trailer with energetic pacing.",
  hosted: true,
  private: true,
  fileIds: ["<file-id-1>", "<file-id-2>"],
});
console.log(link);
```

Success output:

```json
{
  "id": "67e6f6e6c5a91e4d2d9b0a77",
  "shared_url": "https://your-endpoint.wisylink.com/67e6f6e6c5a91e4d2d9b0a77",
  "status": "pending",
  "created_at": 1762432496000,
  "updated_at": 1762432496000
}
```

#### Get Link

(wisylink links get <id>)

Maps to `GET /links/:id`.
Response includes `type`, `prompt`, `hosted`, `private`, `status`, `meta` (`title`, `description`, `cover`, `duration`), `outputs`, `file_ids`, timestamps, and `shared_url`. `meta` is present only when `status` is `completed`; `meta.duration` is included only for `audio` and `video` types.

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

#### Update Link

(wisylink links update <id>)

Maps to `PATCH /links/:id`.

Arguments:

| Flag | Type | Required | Rules |
| --- | --- | --- | --- |
| `--prompt` | `string` | No | 1..5000 chars |
| `--hosted` | `boolean` | No | `true` / `false` |
| `--private` | `boolean` | No | `true` / `false` |
| `--file-id` | `string` | No | Repeatable flag, full replacement when sent |

Rules:
- Provide at least one updatable flag.
- Endpoint prefix (Linkbase) must be configured before link update.
- If `--file-id` is sent, it replaces the full attachment set.
- To keep existing attachments, include them again in the same update command.
- Hosted links cost 1 credit/day; hosted + private links cost 2 credits/day.

Example:

```bash
wisylink links update 67e6f6e6c5a91e4d2d9b0a77 \
  --prompt "Create a 20-second trailer, emphasize motion graphics." \
  --hosted false \
  --private true \
  --file-id 67e6f6e6c5a91e4d2d9b0a22
```

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({ apiKey: "<api-key>" });
const link = await client.updateLink("<link-id>", {
  prompt: "Create a 20-second trailer, emphasize motion graphics.",
  hosted: false,
  private: true,
  fileIds: ["<file-id>"],
});
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
