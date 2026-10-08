---
layout: page
title: "Game Draft Storage Compatibility"
description: "Preserve native game drafts and their history when rolling back a server."
---

# Game draft storage compatibility

Before rolling back the server, check the persisted draft format as well as the
database schema. The game document's `schemaVersion` and `engineVersion` do not
describe draft storage compatibility.

## Version identifiers

[The game model](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/game.ts) stores immutable draft files at
`<source_root>/drafts/<version_id>.json`. The `games.draft_version_id` column
points to the current draft. Each `game_draft_changes.before_digest` value
identifies the before-file used to undo that change.

Legacy identifiers are the 64-character SHA-256 digest of the exact file bytes.
The publication-safety implementation introduced by PR #6180 writes identifiers
with three parts:

```text
<sha256>.<baseUpdatedAt encoded as base64url>.<unique version ID>
```

The reader accepts both formats and verifies the file against the digest part.
The captured base token and unique suffix let cleanup distinguish concurrent
write attempts, even when their content is identical.

## Server rollback

The reader before PR #6180 compares the file hash against the entire stored
identifier. It rejects a dotted identifier with `Game draft source is corrupt`.
A database schema check alone will not detect this incompatibility.

Keep the compatible draft reader and cleanup behavior when rolling back other
server changes. If the target cannot retain them, require a reviewed offline
conversion before starting that server:

1. A1: Stop every game writer and cleanup process. Back up the game database
   rows, change rows and workspace draft files together.
2. A2: Verify the exact bytes of every referenced current draft and before-file
   against its digest. Stop if a file is missing or corrupt. Replacing it with a
   published revision would discard unpublished work.
3. A3: Copy verified files to the legacy digest filenames and update both current
   draft pointers and history before-file references consistently. Keep the
   original files and backup available for reversing the conversion.
4. A4: Read the converted current drafts and undo sources with the target reader
   before restarting writers. Compare their content with the backup.

Do not strip suffixes from database values without creating and verifying the
corresponding files. Do not run old and new writers together during conversion.
Legacy content-addressed paths lack the write-attempt identity used by the newer
cleanup rules.

## Legacy file retention

Normal orphan cleanup preserves legacy digest-only files because they carry no
captured base token. A separate maintenance sweep must exclude old writers and
preserve every file referenced by a current draft or retained change. File age
alone does not prove that a legacy file is safe to delete.

See [production rollback](docker-production-deploy.md#rolling-release) for
the deployment procedure.
