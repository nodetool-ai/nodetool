# @nodetool-ai/deploy

NodeTool deployment toolkit — Docker image builds, SSH/compose provisioning, and self-hosted server management for [NodeTool](https://nodetool.ai).

This package builds Docker images, provisions self-hosted servers over SSH with generated Compose files, and manages deployment state, progress, remote users, and admin operations. It exposes framework-agnostic route handlers so the same deploy logic backs both the CLI and the API.

## Install

```bash
npm install @nodetool-ai/deploy
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `DeploymentManager` | class | Lists, runs, and tracks deployments via pluggable deployer factories |
| `DeploymentConfig` | type | Loaded deployment configuration (from `deployment.yaml`) |
| `StateManager` | class | Persists and reads deployment state |
| Progress helpers | function | Progress tracking for long-running deploys |
| SSH / Docker utilities | function | SSH sessions, image builds, `docker run`, image specs |
| `SelfHostedDeployer` | class | Deploys to a self-hosted server over SSH + Compose |
| Compose generation | function | Generates `docker-compose` files for a deployment |
| Auth / user helpers | function | Remote user management and API user manager |
| Admin client / operations / routes | function | Admin API client, operations, and route handlers |
| Sync / workflow syncer | function | Syncs workflows and assets to a deployed server |
| Storage / collection routes | function | Framework-agnostic route handlers |

## Usage

```ts
import { DeploymentManager, StateManager } from "@nodetool-ai/deploy";

const manager = new DeploymentManager(config, new StateManager(), deployerFactories);
const deployments = await manager.listDeployments();
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
