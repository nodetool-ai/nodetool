# Runtime Install Design: One Model for Desktop, CLI and Server

Status: proposed, revision 2. Scope: how NodeTool installs and finds optional
software on every host: npm runtime libraries, the conda environment, Python
packages and uv tools. It extends the
[Runtime Package Interface](runtime-package-interface.md), which is implemented
for the desktop app only. TypeScript node packs stay under the
[CLI Pack System](cli-pack-system-design.md). This design does not change its
D2.

Codes are stable: findings F1 to F44 (F9 to F44 come from two reviews),
decisions D1 to D16, risks R1 to R9, questions Q1 to Q4. Section 12 maps every
review finding to its resolution.

## 1. Summary

1. Each host owns its install locations. The desktop app and the CLI keep
   separate npm roots, uv tools and micromamba binaries. They share only the
   conda environment, which is the largest item and already recorded in
   `settings.yaml`.
2. One resolver in `@nodetool-ai/config` computes the locations of a host. One
   startup step puts them on the process environment.
3. One registry in `@nodetool-ai/protocol` declares every runtime package.
4. One installer package does the install work for the desktop Package Manager
   and `nodetool runtime add`. It follows the installer rules of the CLI pack
   spec: scripts off, plan check, verification, declared rebuilds only, one
   lock per target.
5. A missing runtime produces one error. Its text names a command that works
   on the host that failed, and a bring-your-own command.

## 2. Current state

### 2.1 Install kinds

The table gives defaults. The precedence rules follow it.

| Kind | Default location | Installer | How the backend finds it |
|---|---|---|---|
| Conda env | macOS `~/nodetool_env`. Linux `~/.local/share/nodetool/conda_env`, or `/opt/nodetool/conda_env` when `SUDO_USER` is set. Windows `%ALLUSERSPROFILE%\nodetool\conda_env`, or `%APPDATA%\nodetool\conda_env` when `ALLUSERSPROFILE` is unset (`electron/src/config.ts:34`) | `micromamba create` with `ca-certificates` only (`electron/src/installer.ts:584`). Python, uv, ffmpeg, pandoc, pdftotext, yt-dlp and rust install later as separate runtime packages | the `PATH` that `getProcessEnv` builds (`electron/src/config.ts`) |
| Python packages | the env's interpreter | `installRequiredPythonPackages` (`electron/src/python.ts:293`) installs `nodetool-core` and caller additions. `packageManager.ts` installs Python node packs, with torch backend selection, CPU fallback and the requirements of packs already installed (`:359`, `:970`, `:1113`) | `PythonStdioBridge`, see below |
| uv tools | `userData/uv-tools/{tools,bin,python}` (`uvToolDirs.ts`) | `uv tool install` with the env's uv (`UvToolRuntimePackage.ts`) | the desktop `PATH` |
| npm root | `userData/optional-node` (`NpmRuntimePackage.ts`, `nodePackManager.ts`) | the npm bundled with the app, system npm in an unpackaged build (`config.ts:457`). Cache in `userData/npm-cache` | `NODETOOL_OPTIONAL_NODE_MODULES`, set at backend spawn (`config.ts:352`) |

Precedence rules:

- The desktop records the env path as `CONDA_ENV` in `settings.yaml`, under
  `~/.config/nodetool` on macOS and Linux and `%APPDATA%\nodetool` on Windows
  (`electron/src/settings.ts:70`).
- micromamba comes from an explicit path, the bundled binary or `PATH` before
  the app downloads the pinned 2.3.3-0 into `userData/micromamba`
  (`installer.ts:314`).
- The Python bridge takes the `pythonPath` option or `NODETOOL_PYTHON`. Next it
  takes an active `CONDA_PREFIX` whose name or path marks a NodeTool env and
  whose interpreter exists. Last it tries a default list per platform, which
  includes Miniconda, Anaconda and `/opt` paths
  (`packages/runtime/src/python-stdio-bridge.ts:466`).
- `userData` is `~/Library/Application Support/nodetool` on macOS.
  `getNodetoolDataDir()` is `$XDG_DATA_HOME/nodetool` (default
  `~/.local/share/nodetool`) on macOS and Linux and `%APPDATA%\nodetool` on
  Windows. The database and assets have further overrides
  (`packages/config/src/paths.ts:47`).

Other hosts:

- **CLI (uncommitted work).** `nodetool runtime add` installs npm libraries into
  `<dataDir>/optional-node`. It spawns `npm` from `PATH`, through a shell on
  Windows (`packages/cli/src/commands/runtime.ts:98`). It covers npm ids only.
- **install.sh** downloads micromamba 2.3.3-0 into `<dataDir>/micromamba` and
  creates the env at `<dataDir>/conda_env`. `NODETOOL_HOME` and `--prefix`
  change both paths (`install.sh:537`).
- **Source checkout.** Most runtime libraries are devDependencies of the
  packages that import them, so `npm install` provides them. `node-llama-cpp`
  and `@fugood/whisper.node` are peers only. `npm run dev:server` starts
  `packages/websocket/src/server.ts` directly and never applies the CLI's
  optional root (`scripts/dev-server.mjs:79`).
- **Docker image.** It installs a curated `SERVER_OPTIONAL_PACKAGES` list with
  `--ignore-scripts` at build time (`scripts/bundle-backend.mjs:225`) and sets
  `NODETOOL_OPTIONAL_NODE_MODULES` (`Dockerfile:163`). `/opt/venv` is a tool
  venv for `execute_bash` (yt-dlp, PDF libraries) without `nodetool-core`. The
  image has no Python-node env, and the server disables the bridge in
  production unless `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`
  (`packages/websocket/src/server.ts:2130`).

### 2.2 Findings

- **F1. The CLI can install only one of the four kinds.** `nodetool runtime add`
  covers npm libraries. An npm user without the desktop app gets Python,
  ffmpeg or manimgx only through `install.sh`, a manual conda setup, or the
  system package manager.
- **F2. No backend package reads `settings.yaml`.** The CLI never sees a custom
  `CONDA_ENV`.
- **F3. The Python bridge misses the `install.sh` env on macOS.** Its macOS
  list is `~/nodetool_env`, `~/miniconda3/envs/nodetool` and
  `~/anaconda3/envs/nodetool`. [installation.md](installation.md#python-nodes-without-the-desktop-app)
  works around it by telling macOS users to set `NODETOOL_PYTHON`.
- **F4. A library installed in the desktop app is invisible to the CLI.** D2
  keeps it that way on purpose.
- **F5. The install rules for conda and uv live in Electron.**
  `electron/src/runtime/packages/definitions.ts` holds them. Only the npm specs
  are shared (`packages/protocol/src/runtime-npm-packages.ts`).
  [runtime-package-interface.md](runtime-package-interface.md#server-cannot-resolve-runtimes-electron-only-for-v1)
  records this as "Electron-only for v1".
- **F6. Binary, Python and uv tool failures name no command that works outside
  the desktop.** `MissingBinaryError` (`video-nodes`) and `host-binaries.ts`
  point at the Package Manager. The bridge throws a plain error (F38). The npm
  error names `nodetool runtime add`, which works on the installed CLI only
  (F37).
- **F7. Install coordination is incomplete.** `runExclusive` serializes only
  matching keys inside the desktop main process (`electron/src/exclusive.ts:3`).
  Nothing coordinates two processes.
- **F8. The micromamba version is pinned twice.** `electron/src/installer.ts`
  and `install.sh` both say 2.3.3-0. Nothing keeps them equal.

## 3. Prior art

NodeTool is a runtime with plugins that ships on npm, not a library used inside
a project. Tools of that kind own an install directory and run npm or a
downloader into it, whatever way the tool itself was installed:

- **Node-RED** installs nodes as npm packages into `~/.node-red`, records them
  in that directory's `package.json`, and needs a restart to load them.
  ([Node-RED: adding nodes](https://nodered.org/docs/user-guide/runtime/adding-nodes))
- **n8n** installs community nodes into `~/.n8n/nodes` with `npm i <package>`,
  then restarts. ([n8n: manual installation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/manual-installation))
- **oclif CLIs** (Heroku, Salesforce) install plugins at runtime with npm into
  the CLI's data directory. ([oclif plugin-plugins](https://cdn.jsdelivr.net/npm/@oclif/plugin-plugins@5.4.61/README.md),
  [oclif config](https://oclif.io/docs/config))
- **Playwright and Puppeteer** download browsers into a user cache
  (`~/.cache/ms-playwright`, `~/.cache/puppeteer`) and fail with one command to
  run: `npx playwright install`. ([Puppeteer configuration](https://pptr.dev/guides/configuration))

Libraries used inside a project (ESLint, Prettier) do the opposite: the user's
`package.json` owns the plugins. That model needs a project, which a NodeTool
user does not always have.

### 3.1 Measured npm resolution

A test with a stub CLI package on npm 11.16 showed where Node resolves a
library that is installed after the CLI. Section 11 adds the fixture to the
repo.

| How the CLI runs | Library installed with | Loads |
|---|---|---|
| `npm install -g cli` | `npm install -g lib` | yes |
| project install | `npm install lib` in the project | yes |
| `npx cli` | `npm install -g lib` | **no** |
| `npx -p cli -p lib` | (same command) | yes |

A global sibling library survives a CLI upgrade, because npm changes only the
global packages a command names. It fails under npx. A library installed inside
the CLI's own package directory loads in every mode but disappears on a global
CLI reinstall (pack spec E4). An owned directory reached through
`NODETOOL_OPTIONAL_NODE_MODULES` needs one command in every mode and survives
upgrades.

npm 11.16 does not enforce `allowScripts` by default. It runs the install
scripts of packages nobody reviewed and prints a warning. Only an explicit
`false` entry or `strict-allow-scripts` blocks a script. The managed installer
therefore turns scripts off and runs only declared rebuilds (D6).
`node-llama-cpp` needs its postinstall.

## 4. Goals and non-goals

Goals:

- Every host computes its locations through one function.
- `nodetool runtime add <id>` installs every kind that the desktop Package
  Manager installs, through the same installer code.
- Every missing-runtime failure names a command that works on the host that
  failed, plus a bring-your-own command.
- Two processes never change one install target at the same time.

Non-goals:

- No shared npm root between the desktop app and the CLI (D2).
- No change to how TypeScript node packs install. The pack spec owns that.
- No file moves of existing installs.
- No install from `serve`, `mcp serve`, the job runner, chat or NodeTool agent
  tools (pack spec 13.1). An external agent that runs `nodetool runtime add` in
  the user's shell acts as the user, as with any CLI command.
- The Docker image never installs at run time.
- No change to which packages exist. `webgpu`, `node-web-audio-api`,
  `mediabunny` with `@mediabunny/server`, `@hyzyla/pdfium` and `chart.js` are
  regular dependencies (pack spec D16), not runtime packages.
- No new Python packaging model. Python packs stay PyPI packages installed into
  the env's interpreter.
- `install.sh` stays a standalone Python installer (D13).

## 5. Design

### 5.1 Hosts

The host identity is the value of `NODETOOL_HOST` (D14). The entry point that
starts the process sets it. A value that is already set wins.

| Host | Set by | npm root | uv tools | micromamba | Conda env |
|---|---|---|---|---|---|
| `desktop` | Electron, in the backend environment | `userData/optional-node` | `userData/uv-tools` | `userData/micromamba` | `CONDA_ENV`, else the desktop default |
| `cli` | CLI entry, in global or local mode (pack spec 11.1) | `<dataDir>/optional-node` | `<dataDir>/uv-tools` | `<dataDir>/micromamba` | `CONDA_ENV`, else `<dataDir>/conda_env` |
| `npx` | CLI entry, when its path has an `_npx` segment | as `cli` | as `cli` | as `cli` | as `cli` |
| `source` | `scripts/dev-server.mjs`, and the CLI entry in dev mode | as `cli` | as `cli` | as `cli` | as `cli` |
| `docker` | `ENV NODETOOL_HOST=docker` in the Dockerfile | `/app/backend/optional-node`, filled at build time | none | none | none |

`CONDA_ENV` comes from `settings.yaml` (section 2.1). `NODETOOL_CONDA_ENV`
overrides it, for tests and containers. A new env that the CLI creates goes to
`<dataDir>/conda_env` on every platform, so a fresh Windows CLI has a
per-user destination (F18). New macOS desktop installs use `<dataDir>/conda_env`
too (Q1). Existing envs stay at their recorded path.

### 5.2 Layout of a CLI host

```
<dataDir>                                 ~/.local/share/nodetool, %APPDATA%\nodetool
├── nodetool.sqlite3                      (unchanged)
├── optional-node/
│   ├── package.json                      {name, private, type: "module"}
│   ├── .nodetool-install.lock            (D10)
│   └── node_modules/
├── uv-tools/{tools,bin,python}
├── micromamba/
└── conda_env/                            new envs only
    └── nodetool-env.json                 ownership marker (D3, F17)
```

npm and uv use their default caches on the CLI host. The desktop keeps
`userData/npm-cache` and `userData/uv-cache`.

### 5.3 The resolver and the startup step (`@nodetool-ai/config`)

```ts
type NodetoolHost = "desktop" | "cli" | "npx" | "source" | "docker";

interface RuntimeLocations {
  host: NodetoolHost;
  optionalNodeRoot: string | null;   // null on docker: the image sets its own
  uvTools: { tools: string; bin: string; python: string } | null;
  micromambaRoot: string | null;
  condaEnv: string | null;           // null on docker
}

function runtimeLocations(env?: NodeJS.ProcessEnv): RuntimeLocations;
function runtimeBinPath(locations: RuntimeLocations): string[];
function applyRuntimeEnv(env?: NodeJS.ProcessEnv): void;
```

- The desktop locations take `userData` as an argument from Electron. Backend
  packages never compute an Electron path.
- `applyRuntimeEnv` sets `NODETOOL_OPTIONAL_NODE_MODULES` and prepends
  `runtimeBinPath` to `PATH`. It never replaces a value that is already set. It
  sets the paths also when they do not exist yet, so a later install of an npm
  library or a binary loads without a restart.
- Three entry points call it: the CLI entry (it replaces
  `applyOptionalNodeModules`), the websocket server entry (which covers the
  dev server and the bundled server), and Electron's `getProcessEnv`.

The bridge tries interpreters in this order (Q2):

1. The `pythonPath` option, then `NODETOOL_PYTHON`.
2. On the `source` host only, an active NodeTool `CONDA_PREFIX`.
3. `runtimeLocations().condaEnv`.
4. On the other hosts, an active NodeTool `CONDA_PREFIX`.
5. The current default lists, kept for envs that nothing recorded (F12).

### 5.4 The registry (`@nodetool-ai/protocol`)

One declarative entry per runtime package. `runtime-npm-packages.ts` grows into
it, and `definitions.ts` in Electron becomes an adapter that builds
`RuntimePackage` instances from it.

```ts
interface NpmComponent {
  name: string;
  version: string;   // exact pin, installed by `add`
  range: string;     // what a host accepts as installed
}

type RuntimeInstallSpec =
  | { kind: "npm"; components: NpmComponent[]; installScripts?: string[] }
  | { kind: "conda"; condaPackages: string[]; binaries: string[]; windowsBinSubdir?: string }
  | { kind: "uv-tool"; toolSpec: string; python: string; binaries: string[] }
  | { kind: "provided"; binary: string };          // nodejs: the host supplies it

interface RuntimePackageSpec {
  id: RuntimePackageId;
  name: string;
  description: string;
  category: "language" | "tool" | "library";
  platforms?: readonly NodeJS.Platform[];
  dependsOn?: readonly RuntimePackageId[];
  approxSizeMB?: number;
  install: RuntimeInstallSpec;
  postInstall?: "python-core";                     // python: install nodetool-core
  bringYourOwn: { kind: "path"; binary: string } | { kind: "env"; variable: string } | { kind: "npm" };
}
```

The micromamba bootstrap is not a runtime package. The installer runs it before
the first `conda` install. Python node packs stay in `PYTHON_NODE_PACKS`.

### 5.5 The installer (`@nodetool-ai/runtime-install`)

A Node package with no Electron imports. The Electron main process and the CLI
command layer import it. No package that `websocket`, `agents` or `runtime`
depends on imports it, and it refuses to run in a process that `serve` or
`mcp serve` marked (pack spec 13.2).

| Operation | Implementation |
|---|---|
| npm libraries | The pack spec 14.1 invocation: `npm-cli.js` beside `process.execPath`, never `npm.cmd` through a shell, npm 10.9.0 or later. Plan with `--dry-run`, install with `--ignore-scripts --save-exact`, check versions and integrity, run `npm rebuild <name> --ignore-scripts=false` for `installScripts` entries only, load-check in a child process. |
| micromamba bootstrap | explicit path, bundled binary, `PATH`, else download `MICROMAMBA_VERSION` and check the SHA-256 for the platform before the first run (D11) |
| conda env | `micromamba create -p <env>` when the env is absent, then write `nodetool-env.json`. `micromamba install -p <env>` for packages. A reinstall or removal of the env requires the marker (F17). |
| Python core and packs | `uv pip install --python <env python>`, with the policy moved from `packageManager.ts`: torch backend detection, CPU fallback, torch family reinstall, the requirements of installed packs, and a check after install (F15) |
| uv tools | `uv tool install` with the environment from `UvToolRuntimePackage.ts` |
| status | per component: `installed`, `missing`, `incompatible` (outside its range) or `broken` (present but fails the load check) |
| uninstall | refuses when another installed package lists it in `dependsOn`. Never touches an env without the marker. Reports a file that a running process holds (Windows) with the process name. |

Every operation emits `RuntimeProgress` events and runs under the lock of its
target (D10). `dependsOn` takes the locks in a fixed order: micromamba, then
the env, then the target.

### 5.6 CLI commands

| Command | Status | Does |
|---|---|---|
| `nodetool runtime list [--json]` | exists, npm only | every package: id, name, status, version per component, location, install command |
| `nodetool runtime add <id...> [--reinstall]` | exists, npm only. conda, uv and Python in step 4 | install the running host's pins, with `dependsOn` first. `--reinstall` replaces the repair operation. |
| `nodetool runtime remove <id...>` | exists, npm only | uninstall |
| `nodetool runtime path` | exists | print the npm root |

`add` is also the update: it installs the pins of the running CLI. There is no
`update` or `repair` command. `add` prints the restart line of section 5.7 when
the package needs one.

### 5.7 Error contract

One error type replaces `MissingBinaryError`, the `host-binaries.ts` message
and the plain bridge errors. It keeps the `MissingRuntimePackageError` name and
the `missingRuntimePackageOf` lookup, so the kernel actor and the editor's
install offer keep working.

```ts
interface MissingRuntimeDetails {
  runtimePackage: RuntimePackageId;
  missing: string;                                   // the specifier or binary that failed
  reason: "missing" | "incompatible" | "broken";
  managed: string | null;                            // the command for this host
  bringYourOwn: string | null;
  restart: string | null;                            // set when the fix needs a restart
}
```

`missingRuntimeText(details)` builds the message from `NODETOOL_HOST`. No host
registers anything. The npm example is `pdf-js`, which `loadLiteParse` throws
for `@llamaindex/liteparse` (`packages/document-nodes/src/lib/pdf-text.ts:24`).
Strings marked "new" need code from section 7.

| Host | `managed` for `pdf-js` | `bringYourOwn` for `pdf-js` |
|---|---|---|
| `desktop` | `Install PDF Libraries in Settings › Packages.` | `npm install --prefix "<userData>/optional-node" @llamaindex/liteparse@1.5.3 pdf-parse@2.4.5 pdf-lib@1.17.1` |
| `cli` | `nodetool runtime add pdf-js` | the same npm command with `<dataDir>/optional-node` |
| `npx` (new) | `npx -p @nodetool-ai/cli@<running version> nodetool runtime add pdf-js` | as `cli` |
| `source` (new) | `npm run dev:nodetool -- runtime add pdf-js` | as `cli` |
| `docker` (new) | `The server image does not include PDF Libraries. Rebuild it with --build-arg NODETOOL_RUNTIME_PACKAGES=pdf-js.` | `Or mount a node_modules directory that holds @llamaindex/liteparse@1.5.3, pdf-parse@2.4.5 and pdf-lib@1.17.1, and set NODETOOL_OPTIONAL_NODE_MODULES to it.` |

The npx string names `-p` and the bin, because the CLI package has two bins
(`nodetool` and `nodetool-chat`). The bring-your-own npm command is a plain
`npm install`. It runs install scripts as the user's npm configuration allows,
which is the user's choice.

An npm library needs no restart, because `applyRuntimeEnv` set its root at
startup (5.3). A binary needs no restart for the same reason.

The Python bridge (D16). `PythonStdioBridge.ensureConnected` throws
`MissingRuntimePackageError` with id `python` when no candidate exists
(`python-stdio-bridge.ts:148`). The `ensurePythonBridge` path in
`server.ts` passes it on. A workflow that names a node type from a
`PYTHON_NODE_PACKS` namespace while the bridge is unavailable fails with the
same error, not with an unknown node type. The server checks the bridge once at
startup (`server.ts:2075`), so every Python fix on a server host needs a
restart.

| Host | `managed` for `python` | `restart` |
|---|---|---|
| `desktop` | `Install Python in Settings › Packages.` | none |
| `cli`, `npx`, `source` before step 4 | `curl -fsSL https://raw.githubusercontent.com/nodetool-ai/nodetool/main/install.sh \| bash` | `Restart nodetool serve.` when a server failed |
| `cli` after step 4 | `nodetool runtime add python` (`npx` and `source` use their prefix) | as above |
| `docker` | `This server image has no Python worker. Set NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1 and NODETOOL_PYTHON to a Python 3.11+ that has nodetool-core installed.` | `Restart the container.` |

`bringYourOwn` for Python on every host except `docker`:
`Or set NODETOOL_PYTHON to a Python 3.11+ that has nodetool-core installed.`
For a conda binary it is `Or put ffmpeg on PATH (brew install ffmpeg, apt install ffmpeg).`
For a uv tool it is `Or put manimgx on PATH (uv tool install manimgx).`

An example message on the `cli` host:

```
The optional package @llamaindex/liteparse (PDF Libraries) is not installed.
Install it, then run the command again:
  nodetool runtime add pdf-js
or with npm:
  npm install --prefix "/Users/me/.local/share/nodetool/optional-node" @llamaindex/liteparse@1.5.3 pdf-parse@2.4.5 pdf-lib@1.17.1
```

Structured forms (D12):

- CLI `--json` output carries the details as `error: "missing_runtime_package"`.
  The CLI exits with 3, the code the pack spec uses for `missing_pack`. Callers
  check the discriminator, not the code alone.
- `RunSandboxResult` keeps `missingRuntimePackage: RuntimePackageId` and adds
  `missingRuntime: MissingRuntimeDetails` (`packages/agents/src/js-sandbox.ts:2773`).
- The kernel actor puts the details on the node error message, next to the id.

### 5.8 Desktop integration

- The Package Manager UI, the IPC surface and the progress rendering stay in
  Electron. Their implementation calls the installer package.
- `getProcessEnv` calls `runtimeLocations` for the `desktop` host and sets
  `NODETOOL_HOST=desktop`. The paths do not change.
- The desktop and the CLI share only the conda env. The installer refuses a
  `nodetool-core` change outside the range that the other host recorded in
  `nodetool-env.json`, and names the update of that host (D3).

### 5.9 Server image

- `SERVER_OPTIONAL_PACKAGES` stays curated. A test asserts that each entry
  belongs to a registry `npm` component (F20).
- A build argument, `NODETOOL_RUNTIME_PACKAGES`, adds registry ids to the
  image. The build installs them with `--ignore-scripts` and runs their
  declared rebuilds, as the installer does.
- The image sets `NODETOOL_HOST=docker`.

## 6. Decisions

- **D1. One resolver, locations per host (revised).** `runtimeLocations`
  computes every location from the host (5.1). Only the conda env is shared.
  New CLI envs go to `<dataDir>/conda_env` on every platform. Discovery of
  legacy envs stays.
- **D2. No shared npm root (revised).** The desktop keeps
  `userData/optional-node`. The `cli`, `npx` and `source` hosts use
  `<dataDir>/optional-node`. A shared root breaks when the desktop and the CLI
  run different releases (F11). It also needs a merge of populated trees (F13)
  and a migration that depends on the network (F19). TypeScript node packs stay
  under the pack spec, whose D2 does not change.
- **D3. Pins install, ranges accept, per component (revised).** `add` installs
  the running host's exact pins. A component outside its `range` has status
  `incompatible`, and the error names `add`. This replaces the
  newest-compatible rule of the runtime package interface (F29). In the shared
  env, each host records its accepted `nodetool-core` range in
  `nodetool-env.json`.
- **D4. Native npm packages use Node-API.** The CLI runs whatever Node the user
  switches to. The installer's load check in a child process detects an ABI
  failure as `broken`. `@fugood/whisper.node` is unverified (Q3).
- **D5. Replaced by D10.**
- **D6. Install scripts run only for declared packages (revised).** The
  installer installs with `--ignore-scripts` and rebuilds only the
  `installScripts` entries, with pinned version and integrity (pack spec 14.4).
  `allowScripts` is not a security boundary in npm 11.16 (F9).
- **D7. Withdrawn.** No files move (D1, D2).
- **D8. `runtime add` covers every kind, from the CLI command layer only
  (revised).** The servers, the job runner, chat and NodeTool agent tools never
  install (pack spec 13.1). There is no install capability. An external agent
  in the user's shell runs the same command a person runs.
- **D9. Every kind keeps a bring-your-own path, and the error names it.**
  `PATH` for binaries, `NODETOOL_PYTHON` for Python, `npm install --prefix` for
  npm.
- **D10. One lock per install target (revised).** The lock file sits inside
  the target's realpath: the npm root, the env, the uv tools root, the
  micromamba root. It follows pack spec 14.3: exclusive create, a heartbeat,
  staleness after 60 seconds without a heartbeat. A lock inside the shared
  Windows env protects every user (F14). A manual `npm` or `uv` command and
  older desktop releases do not take the lock.
- **D11. One micromamba pin with hashes (revised).** The installer package
  exports `MICROMAMBA_VERSION` and a SHA-256 per platform. A script generates
  the matching block in `install.sh`. A test compares them (F26).
- **D12. The missing-runtime error is structured (revised).** The details
  travel in `--json` output, tool results, node errors and the sandbox result.
  The existing id field stays (F28).
- **D13. Withdrawn.** `install.sh` stays a standalone Python installer with its
  options. Only its micromamba block changes (D11, F27).
- **D14. The host identity is `NODETOOL_HOST`.** The entry point sets it. The
  error text and the resolver read it. This replaces a phrasing registry (F41).
- **D15. One startup step for every entry point.** `applyRuntimeEnv` runs in
  the CLI entry, the websocket server entry and Electron's `getProcessEnv`. It
  never replaces a value that is already set (F21).
- **D16. A missing Python is a missing runtime package.** The bridge and the
  node resolver throw `MissingRuntimePackageError` with id `python` (F38).

## 7. Migration

Each step ships alone. The error names only commands that work on the host at
that step (F43).

1. **Lock, resolver and host identity.** Add the lock (shared with the pack
   spec), `runtimeLocations`, `applyRuntimeEnv` and `NODETOOL_HOST` in every
   entry point. The bridge adds the resolver env to its candidates and keeps
   its lists, which fixes F3. The CLI root gets `"type": "module"`, and the
   CLI runs npm by the pack spec 14.1 rule. No files move.
2. **Error contract.** Add `MissingRuntimeDetails`, `missingRuntimeText`, the
   bridge mapping (D16), the sandbox field, the CLI `--json` form and exit
   code 3. npm ids name `runtime add`. Python names `install.sh` on the CLI
   hosts. Conda and uv ids name only their bring-your-own command outside the
   desktop.
3. **Registry.** Move the conda and uv specs from `definitions.ts` into the
   protocol registry, with per-component ranges. Electron's `definitions.ts`
   becomes an adapter. Add the server subset test and the Docker build
   argument.
4. **Installer package.** Move the install code and the `packageManager.ts`
   policy out of Electron. The desktop switches to it with no visible change.
   `runtime add` gains conda, uv and Python. The CLI error texts switch from
   `install.sh` to `runtime add python`.
5. **Docs.** Update the pages in section 8.

## 8. Document changes

| Page | Change |
|---|---|
| [cli-pack-system-design.md](cli-pack-system-design.md) | Runtime libraries that a pack declares install into the host's npm root through `runtime add`, not into the pack install root. The lock implementation is shared. |
| [runtime-package-interface.md](runtime-package-interface.md) | Replace "Electron-only for v1" with a link to this design. Replace the newest-compatible version rule with D3. |
| [installation.md](installation.md) | Remove the macOS `NODETOOL_PYTHON` workaround after step 1. Use `nodetool runtime add python` after step 4. |
| [cli.md](cli.md) | The `runtime` commands of section 5.6. |
| [docker-production-deploy.md](docker-production-deploy.md) | The `NODETOOL_RUNTIME_PACKAGES` build argument. |
| `packages/AGENTS.md` | How to add a runtime package: registry entry, optional peer, Node-API rule, install scripts, error test. Link from `electron/src/AGENTS.md`. |

## 9. Risks

- **R1. Withdrawn.** No migration moves files.
- **R2. Split data directories on Linux.** A Flatpak desktop or a per-app
  `XDG_DATA_HOME` gives the CLI a different `settings.yaml`, so the CLI does not
  see the desktop env. `nodetool runtime list` prints the resolved env path.
  This design does not support sharing across that boundary (F22).
- **R3. Large installs from the CLI.** Python with uv takes several hundred MB,
  torch takes gigabytes. `add` prints `approxSizeMB` before it starts and
  installs only on an explicit command.
- **R4. Two Node versions on one CLI root.** D4 and the load check report a
  `broken` status with the `--reinstall` command.
- **R5. Windows shared env.** The CLI uses an existing shared env when
  `CONDA_ENV` names it and takes the lock inside it. When the env is not
  writable, the error names an elevated shell. The CLI never creates an env
  there.
- **R6. Scope.** The change crosses Electron, config, protocol, runtime, cli,
  video-nodes, websocket and the Docker build, in five steps.
- **R7. Old npm.** The installer requires npm 10.9.0 or later (pack spec D15)
  and names the upgrade command.
- **R8. Duplicate disk use.** A machine with the desktop app and the CLI holds
  two copies of each npm library and uv tool it uses (D2). The conda env, the
  largest item, stays shared.
- **R9. `nodetool-core` skew in the shared env.** A desktop and a CLI of
  different releases can need incompatible `nodetool-core` versions. D3 refuses
  the change and names the update of the other host.

## 10. Open questions

- **Q1. Decided.** New macOS desktop installs create the env at
  `<dataDir>/conda_env`. Existing installs keep their recorded path.
- **Q2. Decided.** Section 5.3 gives the order. An active `CONDA_PREFIX` wins
  over the configured env only on the `source` host.
- **Q3. Open.** Does `@fugood/whisper.node` 1.1.3 use Node-API on every
  platform? `webgpu` and `node-av` are core dependencies now (pack spec D16),
  so no host installs them into its npm root.
- **Q4. Moved to the pack spec.** Pack precedence between a project and an
  install root is a pack question (F30).

## 11. Verification

| Test | Proves | Location |
|---|---|---|
| `runtimeLocations` per host and platform, with and without `CONDA_ENV`, `NODETOOL_CONDA_ENV` and `XDG_DATA_HOME` | D1, D14 | `packages/config/tests/` |
| `applyRuntimeEnv` never replaces a set value and sets absent paths | D15 | `packages/config/tests/` |
| The exact error text per host and kind, with real paths | D9, D12 | `packages/protocol/tests/` |
| A clean-HOME run of each printed managed npm command against a local test registry, for `cli`, `npx` and `source` | 5.7 | `scripts/__tests__/`, on request, with the pack spec 19.3 matrix |
| The never-install matrix: the installer refuses in a `serve` or `mcp serve` process, and no capability installs | D8 | `packages/cli/src/commands/__tests__/runtime.test.ts`, `packages/agents/tests/` |
| A missing runtime round trip: node error, sandbox result, CLI `--json` with exit code 3 | D12 | `packages/kernel/tests/`, `packages/cli/src/commands/__tests__/` |
| The bridge with no candidate, and a Python node type with the bridge unavailable, throw id `python` | D16 | `packages/runtime/tests/`, `packages/websocket/tests/` |
| Every id has a spec. Each `SERVER_OPTIONAL_PACKAGES` entry is a registry component. `install.sh` has the generated micromamba block | D11, 5.9 | `packages/protocol/tests/`, `scripts/__tests__/` |
| The installer with a stub npm and a stub micromamba: argv, `--ignore-scripts`, declared rebuilds only, env marker check | D6, D10, F17 | `packages/runtime-install/tests/` |
| Two processes start an install on one target at once, and one waits | D10 | `packages/runtime-install/tests/` |
| The npm resolution matrix of section 3.1 | 3.1 | `scripts/__tests__/`, on request |

## 12. Review resolutions

| Finding | Resolution |
|---|---|
| F9 | 3.1 corrected. D6 uses `--ignore-scripts` and declared rebuilds. |
| F10 | Packs stay under the pack spec. A runtime install never changes a pack tree, because the roots are separate (D2). |
| F11 | D2: no shared npm root. D3 and R9 cover the shared env. |
| F12 | 5.3 keeps the legacy lists. No files move. |
| F13 | D2 and D7: no move, no merge. The lock ships in step 1. |
| F14 | D10: the lock sits inside the target. |
| F15 | 5.5 moves the `packageManager.ts` policy. |
| F16 | D8 follows the pack spec. |
| F17 | 5.5: `micromamba create`, ownership marker. |
| F18 | D1: new CLI envs are per user on every platform. |
| F19 | D7 withdrawn. Nothing migrates. |
| F20 | 5.9: the list stays curated, with a subset test. |
| F21 | D15. |
| F22 | R2: no sharing across a Flatpak or XDG boundary. |
| F23 | 5.4 per-component ranges. 5.5 status values. |
| F24 | 5.4 `provided` kind, `postInstall`, bootstrap outside the registry. |
| F25 | 5.5 uninstall rules. |
| F26 | D11. |
| F27 | D13 withdrawn. |
| F28 | 5.7 keeps the id field and adds `missingRuntime`. |
| F29 | D3, R7, section 8. |
| F30 | Q4 moved to the pack spec. |
| F31 to F34 | Section 2.1 corrected. |
| F35 | F6 and F7 corrected. |
| F36 | 3.1 corrected. |
| F37 | 5.1 and 5.7 host tables. |
| F38 | D16. |
| F39 | 5.6 status column. |
| F40 | Step 1 fixes the manifest and the npm invocation. 5.6 adds location and install command to `list`. |
| F41 | D14 replaces the registry. `repair` and `update` are cut. The cache directories are cut. The micromamba pin moves to the installer. `path` stays, because it exists and costs nothing. |
| F42 | Section 11. |
| F43 | Section 7 step 2. |
| F44 | 5.7 uses `pdf-js` as the example. |
