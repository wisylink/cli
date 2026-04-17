# WisyLink CLI

Official WisyLink command-line interface and Node client for API-driven file and link operations.

Built with ❤️ by our team

## Install

```bash
npm i -g @wisylink/cli
```

## Authentication

Set API key once:

```bash
export WISYLINK_API_KEY="your_api_key"
```

Or pass per command:

```bash
wisylink links get 67e6f6e6c5a91e4d2d9b0a77 --api-key "your_api_key"
```

## API URL

CLI always uses:

```text
https://wisylink.com/api
```

## CLI Usage

```bash
wisylink --help
```

### Files

Upload:

```bash
wisylink files upload "./asset.png"
```

Get:

```bash
wisylink files get 67e6f6e6c5a91e4d2d9b0a11
```

Delete:

```bash
wisylink files delete 67e6f6e6c5a91e4d2d9b0a11
```

### Links

Create:

```bash
wisylink links create \
  --type "video" \
  --prompt "Create a short product trailer with energetic pacing." \
  --hosted true \
  --private true \
  --file-id 67e6f6e6c5a91e4d2d9b0a11 \
  --file-id 67e6f6e6c5a91e4d2d9b0a22
```

Get:

```bash
wisylink links get 67e6f6e6c5a91e4d2d9b0a77
```

Update:

```bash
wisylink links update 67e6f6e6c5a91e4d2d9b0a77 \
  --prompt "Create a 20-second trailer, emphasize motion graphics." \
  --hosted false \
  --private true \
  --file-id 67e6f6e6c5a91e4d2d9b0a22
```

Delete:

```bash
wisylink links delete 67e6f6e6c5a91e4d2d9b0a77
```

## Global Flags

- `--api-key <key>`
- `--timeout <ms>` (1000..120000)
- `--help`
- `--version`

## Node Usage

```js
import { CreateWisyLinkClient } from "@wisylink/cli";

const client = CreateWisyLinkClient({
  apiKey: process.env.WISYLINK_API_KEY,
});

const created = await client.createLink({
  type: "image",
  prompt: "Generate an abstract hero visual with warm gradients.",
  hosted: true,
  private: true,
});

console.log(created);
```

## Validation Rules

- `file id` and `link id`: 24-char hex
- max `file_ids`: 10
- prompt max: 5000 chars
- link types: `image`, `audio`, `video`, `pdf`, `page`

## Security Notes

- Your API key is read from `WISYLINK_API_KEY` or `--api-key` and never echoed, logged, or written to any output stream.
- All requests go over HTTPS to `https://wisylink.com/api` — the API URL is fixed and cannot be overridden.
- Command output is JSON-only; no debug traces, stack frames, or credential leaks are printed.
- Keep your API key out of shell history and version control. Use an environment variable or a secret manager.
