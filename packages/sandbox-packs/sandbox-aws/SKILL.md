---
name: sandbox-aws
description: Sign AWS requests (S3 and every other SigV4 service) in a Code node or CodeAct action, with NodeTool's signer running on the host
---

# AWS SigV4 in the sandbox

Specifier: `@nodetool-ai/sandbox-aws`. Import it at the top of the body.

S3 is an HTTP API, so `fetch` already reaches it. What the guest cannot do is
sign the request: SigV4 is an HMAC-SHA256 chain over a canonical form of the
request, and one wrong byte gives a signature mismatch that names nothing.
This pack is a **host module**: the chain runs on the host and hands back
headers.

**Nothing here sends a request.** Both exports are pure — they take a request
and return a signed one. The call goes out through the guest's own `fetch`, so
the run's fetch cap and its SSRF guard still apply.

## sigv4 — sign a request

```js
import { sigv4 } from "@nodetool-ai/sandbox-aws";

const accessKeyId = await nodetool.secrets.get("AWS_ACCESS_KEY_ID");
const secretAccessKey = await nodetool.secrets.get("AWS_SECRET_ACCESS_KEY");

const signed = await sigv4({
  method: "GET",
  url: "https://my-bucket.s3.us-east-1.amazonaws.com/?list-type=2&max-keys=100",
  region: "us-east-1",
  service: "s3",
  accessKeyId,
  secretAccessKey
});

const res = await fetch(signed.url, { method: signed.method, headers: signed.headers });
return { xml: await res.text() };
```

Options: `method` (default `GET`), `url` (required, absolute), `region`
(default `us-east-1`), `service` (default `s3`), `accessKeyId` and
`secretAccessKey` (required), `sessionToken` (for temporary STS credentials),
`headers`, `body`, `payloadHash`.

Returns `{url, method, headers}` — never the body. Pass the same body value to
`fetch` yourself, so bytes make one trip, not two.

### Writing an object

```js
const body = JSON.stringify(inputs.record);
const signed = await sigv4({
  method: "PUT",
  url: `https://my-bucket.s3.us-east-1.amazonaws.com/${inputs.key}`,
  region: "us-east-1", service: "s3",
  accessKeyId, secretAccessKey,
  headers: { "content-type": "application/json" },
  body
});
await fetch(signed.url, { method: "PUT", headers: signed.headers, body });
```

A `Uint8Array` body works the same way — from `workspace.readBytes` or a
previous `response.bytes()`.

## presign — a URL that authorizes itself

```js
import { presign } from "@nodetool-ai/sandbox-aws";

const url = await presign({
  method: "GET",
  url: "https://my-bucket.s3.us-east-1.amazonaws.com/report.pdf",
  region: "us-east-1", service: "s3",
  expiresIn: 3600,
  accessKeyId, secretAccessKey
});
return { url };
```

Returns the URL as a string. `expiresIn` is seconds, clamped to a week. The
payload is unsigned, which is what makes a presigned `PUT` usable — whoever
holds the URL supplies the body.

## Gotchas

- **Every export is async.** A host call is a round trip.
- **It signs; it does not send.** Nothing reaches the network until you call
  `fetch`.
- **The signature is time-bound.** It is stamped when you call `sigv4`, and AWS
  rejects one more than 15 minutes old. Sign immediately before fetching, not
  at the top of a long function.
- **Other services work too.** Set `service` and `region` — `dynamodb`,
  `sqs`, `lambda`, `bedrock`. Only `s3` skips path normalization, because an
  object key is a key.
- **10 MB of body per signature.** Hash a bigger upload yourself and pass
  `payloadHash`, or use a presigned `PUT`.
