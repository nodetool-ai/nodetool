---
layout: page
title: "Package Registry Guide"
---



NodeTool packages bundle reusable nodes, assets, and example workflows. The package registry subsystem (`src/nodetool/packages`) provides discovery, installation, metadata generation, and documentation tooling.

## Package Anatomy

A package is a standard Python project that exposes nodes under the `nodetool.nodes.<namespace>` module path and ships metadata:

- `pyproject.toml` – declares the package name and dependencies.
- `src/nodetool/nodes/<namespace>/` – node implementations.
- `nodes.json` – generated metadata describing nodes, inputs, and outputs.
- `examples/` – optional workflow examples.
- `assets/` – optional static assets used by nodes.

`Registry` (see `src/nodetool/packages/registry.py`) loads `nodes.json`, discovers examples/assets, and exposes helper methods for installation and updates.

## Managing Packages via CLI

### List Packages

```bash
nodetool package list
nodetool package list --available    # fetch registry index
```

Displays installed packages (local metadata) or remote entries hosted at `PACKAGE_INDEX_URL` (see `src/nodetool/packages/registry.py`).

### Install / Update / Uninstall

```bash
nodetool package install <owner>/<repo>
nodetool package update <owner>/<repo>
nodetool package uninstall <owner>/<repo>
```

Commands wrap pip/uv to install the package, then refresh metadata caches stored under `~/.config/nodetool/packages`.

### Scan Project

```bash
nodetool package scan [--verbose]
```

Runs `scan_for_package_nodes()` to inspect the current repository, generate `nodes.json`, and update `pyproject.toml` include rules.

### Initialize Package

```bash
nodetool package init
```

Scaffolds a minimal Hatch project pointing dependencies to `nodetool-core` (implemented in `src/nodetool/cli.py`).

### Generate Documentation

```bash
nodetool package docs --output-dir docs/nodes
nodetool package docs --compact     # shorter summaries for LLM prompts
```

Invokes `generate_documentation()` (see `src/nodetool/packages/gen_docs.py`) to create Markdown documentation for all nodes in the project.

## Publishing Packages

1. Implement nodes under `src/nodetool/nodes/<namespace>/`.
2. Run `nodetool package scan` to produce `nodes.json` and update metadata.
3. Add example workflows in `examples/` and assets in `assets/` if relevant.
4. Commit the generated metadata files.
5. Publish to PyPI or provide a Git URL; the registry supports both pip and Git transport.

To add the package to the public index, create an entry in the [registry repository](https://github.com/nodetool-ai/nodetool-registry) so `package list --available` surfaces it.

## Programmatic Use

The `Registry` class (see `src/nodetool/packages/registry.py`) exposes methods for advanced scenarios:

- `list_installed_packages()` / `list_available_packages()` – enumerate packages.
- `install_package(repo_id)` – install from GitHub-style `owner/repo` identifiers.
- `list_examples()` / `list_assets()` – browse bundled resources.
- `find_example_by_name(name)` – fetch example payloads for testing or documentation.

The registry stores metadata under the system config path (`get_system_file_path("packages")`) to avoid permission issues on shared machines.

## Workflow Integration

Installed packages automatically register nodes with the runtime:

- Node metadata is merged during startup so workflows referencing `package.namespace.Node` resolve without manual imports.
- `nodetool codegen` regenerates DSL helpers for newly-installed packages, making them available from the Python DSL.

## Related Documentation

- [CLI Reference](cli.md) – package subcommands.  
- [Configuration Guide](configuration.md) – where package metadata is cached.  
- [DSL Guide](developer/dsl-guide.md) – creating new nodes and generating DSL wrappers.
