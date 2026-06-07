# Mutation Testing — `@nodetool-ai/security`

This package is security-critical (master-key management, secret encryption), so
its tests are verified with **mutation testing** in addition to ordinary
coverage. Line coverage only proves code *ran*; mutation testing proves the
tests would actually *fail* if the behaviour changed.

## Running it

```bash
npm run test:mutation --workspace=packages/security
# or, from packages/security:
npx stryker run
```

The HTML report lands in `reports/mutation/mutation.html` (git-ignored).

## Current status

```
File               | % score | killed | survived
-------------------|---------|--------|---------
crypto.ts          |  100.00 |     77 |        0
master-key.ts      |  100.00 |     99 |        0
startup-checks.ts  |  100.00 |     26 |        0
-------------------|---------|--------|---------
All files          |  100.00 |    202 |        0
```

The config gate (`stryker.config.json`) **breaks below 90%** so a regression in
test quality fails fast.

## How the suite was hardened

Mutation testing surfaced gaps that 100% line coverage hid. The tests added to
close them target *observable behaviour*, not implementation details
(Uncle Bob's clean-test discipline — each test pins one externally-meaningful
property and reads as Arrange/Act/Assert):

- **Fernet wire format** (`crypto-hardening.test.ts`): version byte `0x80`, the
  timestamp embedded as **unix seconds** (a seconds-vs-millis mutant breaks
  Python-side TTL), unpadded base64url acceptance, and the exact `too short`
  length boundary.
- **Startup error branches** (`startup-checks-error-paths.test.ts`): the master
  key check's throw path and empty-key path, driven by mocking `initMasterKey`.
- **AWS client configuration** (`master-key-aws-config.test.ts`): the region
  default vs `AWS_REGION` override and the exact `SecretId` requested — silent
  misconfigurations in production.
- **Keychain failure contracts** (`master-key-keychain-errors.test.ts`,
  `master-key-keytar-failure.test.ts`): `KeychainAccessError` type/name and the
  full operator-facing message (operation + remediation hint).
- **Lazy keytar loading** (`master-key-keytar-load.test.ts`): the previously
  *uncovered* dynamic-`import("keytar")` path, plus the lazy-load fallback in
  `setMasterKeyPersistent` / `deleteMasterKey` and the `resetKeytarLoader`
  contract.

## Equivalent & non-behavioral mutants

Some mutants **cannot** be killed because they don't change observable behaviour.
Chasing them is wasted effort, so they're suppressed at the source with a
`// Stryker disable` comment that documents *why*:

- **`"utf-8"` encoding arguments** — Node decodes the empty string as utf-8, so
  `Buffer.from(x, "utf-8")` and `Buffer.from(x, "")` are byte-identical.
- **Fernet base64url re-padding** — Node's base64 decoder ignores `=` padding
  entirely, so the re-pad expression is a no-op for the decoder.
- **Diagnostic logging** (`log.debug` / `log.error` / logger names) — log text is
  for humans, not a behavioural contract, so it is deliberately not asserted.
- **keytar cache fast-path** — re-importing yields the same cached module, so
  short-circuiting it is a performance optimization, not a behaviour change.

Each suppression is line-scoped and carries a reason, so the headline score
reflects the quality of the tests over *behavioural* code rather than being
inflated or penalised by mutants no test could legitimately catch.
