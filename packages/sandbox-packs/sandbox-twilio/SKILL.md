---
name: sandbox-twilio
description: Send SMS and WhatsApp messages and look up numbers from a Code node or CodeAct action, with NodeTool's Twilio request builder running on the host
---

# Twilio in the sandbox

Specifier: `@nodetool-ai/sandbox-twilio`. Import it at the top of the body.

Twilio is HTTP Basic auth over form-encoded bodies, on a URL that buries the
account SID in the path. None of that is hard; all of it is easy to get wrong
once, and the failure is a 401 that names nothing.

**Nothing here sends a request.** `request` builds one; the guest's own `fetch`
sends it, under the run's fetch cap and SSRF guard.

## request

```js
import { request } from "@nodetool-ai/sandbox-twilio";

const accountSid = await nodetool.secrets.get("TWILIO_ACCOUNT_SID");
const authToken = await nodetool.secrets.get("TWILIO_AUTH_TOKEN");

const req = await request({
  accountSid, authToken,
  path: "Messages.json",
  method: "POST",
  params: { To: inputs.to, From: inputs.from, Body: inputs.text }
});
const res = await fetch(req.url, req);
if (!res.ok) throw new Error(`Twilio: ${res.json.message ?? res.status}`);
return { sid: res.json.sid, status: res.json.status };
```

Options: `accountSid` and `authToken` (required), `path` (required), `method`
(default `GET`), `params`, `host` (default `api.twilio.com`), `query`.

`params` become the form body on a write and the query string on a read.

A `path` **without** a leading slash is an Account resource and lands under
`/2010-04-01/Accounts/<sid>/`. One **with** a leading slash is used as written,
which is how the other products are reached.

## WhatsApp

Same endpoint; the numbers carry a `whatsapp:` prefix.

```js
const req = await request({
  accountSid, authToken, path: "Messages.json", method: "POST",
  params: {
    To: `whatsapp:${inputs.to}`,
    From: `whatsapp:${inputs.from}`,
    Body: inputs.text
  }
});
```

## Reading messages

```js
const req = await request({
  accountSid, authToken, path: "Messages.json",
  params: { To: inputs.to, PageSize: 50 }
});
const { messages } = (await fetch(req.url, req)).json;
```

## Number lookup

Lookup lives on its own host, so pass an absolute path:

```js
const req = await request({
  accountSid, authToken,
  host: "lookups.twilio.com",
  path: `/v2/PhoneNumbers/${encodeURIComponent(inputs.phone)}`,
  params: { Fields: "line_type_intelligence" }
});
```

## Gotchas

- **`request` is async.** A host call is a round trip.
- **Parameter names are PascalCase.** `To`, `From`, `Body`, `MediaUrl` —
  Twilio ignores what it does not recognize, so a lowercase `body` sends an
  empty message rather than an error.
- **Numbers are E.164.** `+15551234567`, country code and all.
- **Only `*.twilio.com` hosts are accepted**, so a mistyped `host` fails here
  rather than mailing credentials somewhere else.
- **An error is a non-2xx with JSON.** Read `res.json.message` and
  `res.json.code`; the code maps to Twilio's error reference.
