# @nodetool-ai/config

Configuration and environment loading for [NodeTool](https://nodetool.ai) — settings, paths, logging, byte limits, and cross-runtime module loading.

This is the base dependency for the backend: it loads and reads environment variables, resolves data/asset/database paths, registers typed settings, configures logging, and diagnoses the running environment. It also provides cross-runtime helpers for importing Node built-ins and optional modules from code that also runs in the browser.

## Install

```bash
npm install @nodetool-ai/config
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `loadEnvironment` / `resetEnvironment` | function | Load and reset the process environment (dotenv) |
| `getEnv` / `requireEnv` | function | Read an env var, optionally throwing if missing |
| `getByteLimitEnv` | function | Parse a byte-size limit from an env var |
| `registerSetting` / `getSettings` / `clearSettings` | function | Register and read typed settings |
| `SettingDefinition` / `SettingStatus` | type | Setting registration and status shapes |
| `configureLogging` / `getLogLevel` / `createLogger` | function | Configure logging and create named loggers |
| `LogLevel` / `LoggingOptions` / `Logger` | type | Logging types |
| `diagnoseEnvironment` / `maskSecret` | function | Environment diagnostics and secret masking |
| `getNodetoolDataDir` / `getDefaultDbPath` / `getDefaultAssetsPath` | function | Resolve standard data, database, and asset paths |
| `getPostgresDatabaseUrl` / `getDefaultVectorstoreDbPath` | function | Resolve Postgres and vectorstore locations |
| `getAssetFilePath` / `buildAssetUrl` | function | Map asset keys to file paths and URLs |
| `loadAssetStorageConfig` / `loadTempStorageConfig` | function | Load storage configuration from the environment |
| `StorageConfig` / `SIGNED_URL_TTL` | type / const | Storage config shape and signed-URL lifetime |
| `IS_NODE` / `importNodeBuiltin` / `importHidden` / `importOptionalModule` | const / function | Cross-runtime module loading helpers |

## Usage

```ts
import {
  loadEnvironment,
  requireEnv,
  createLogger,
  getDefaultDbPath
} from "@nodetool-ai/config";

loadEnvironment();
const log = createLogger("server");
log.info("db path", getDefaultDbPath());
const token = requireEnv("NODETOOL_TOKEN");
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
