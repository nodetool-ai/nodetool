# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub:
**[Report a vulnerability](https://github.com/nodetool-ai/nodetool/security/advisories/new)**
(Security tab → Advisories → Report a vulnerability).

Do not open a public issue, pull request, or discussion for a vulnerability.

Include:

- the affected component (server, desktop app, web app, mobile app, a node package)
- the version or commit
- the steps or a proof of concept that reproduces it
- what an attacker gains

We acknowledge a report within five business days and keep you informed until
a fix ships. We credit reporters in the published advisory unless you ask us
not to.

## Supported versions

Security fixes go into the latest release and `main`. Older releases do not
receive backports.

## Scope

In scope: the code in this repository, including the API server
(`packages/websocket`), the desktop app (`electron/`), the web app (`web/`),
the mobile app (`mobile/`), and the published `@nodetool-ai/*` packages.

Out of scope: vulnerabilities in third-party model providers or services that
NodeTool calls, and issues that need an attacker who already controls the
machine NodeTool runs on.

## How we look for vulnerabilities

- `.github/workflows/dependency-audit.yml` fails a dependency change that adds a
  high or critical npm advisory. `.github/npm-audit-allowlist.json` records why
  each remaining one is not reachable.
- `.github/workflows/codeql.yml` runs CodeQL on every pull request and weekly.
- `.github/workflows/security-audit.yaml` audits one attack-surface area each
  week and files what it proves as a draft advisory.
