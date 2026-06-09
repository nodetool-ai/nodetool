# topaz-nodes — Topaz API Wrapper

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **topaz-nodes**

> Read [packages/AGENTS.md § External-API Wrapper Nodes](../AGENTS.md#external-api-wrapper-nodes) first. This overlay notes the Topaz specifics from shipped fixes.

`topaz-base.ts` holds the reference **idempotent-retry** logic:

- **`IDEMPOTENT_METHODS = {GET, HEAD, PUT}` — non-idempotent methods get a single
  attempt.** A job-creating `POST`/state-transitioning `PATCH` must not be retried
  on 5xx; the server may have already acted (and billed). Presigned-URL `PUT`
  uploads are safe to retry.
- **Retry thrown network errors (ECONNRESET/timeout) for idempotent requests**,
  not only retryable status codes, and **drain the discarded response body**
  (`await resp.arrayBuffer().catch(() => undefined)`) before sleeping so the
  keep-alive connection is reusable.
- **`parseRetryAfterMs` handles both delay-seconds and HTTP-date**, clamps `>= 0`,
  and falls back to exponential backoff — never `Number(header)` straight into
  `sleep`.
- **Don't sleep after the final poll attempt** — guard the inter-poll delay with
  `if (attempt < maxAttempts - 1)`.

Multipart upload & format detection:

- **Stop chunking once the source is fully consumed** — `partSize = max(1, ceil(size/N))`
  with `if (start >= size) break`, so a small file across many presigned URLs
  doesn't emit zero-byte trailing parts the API rejects.
- **Echo the `uploadId`** (tolerating `uploadId`/`upload_id`) from the accept step
  into the complete-upload call.
- **Detect both TIFF byte orders** in `detectImageMime` — little-endian `49 49 2A 00`
  (`II*`) *and* big-endian `4D 4D 00 2A` (`MM\0*`).
