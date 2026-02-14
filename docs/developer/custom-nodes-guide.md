---
layout: page
title: "Custom Nodes Guide"
description: "How to add custom NodeTool nodes in a package and make them discoverable."
---

This guide shows how to add custom NodeTool nodes in a package and make them discoverable.

## 1. Create a package layout

Use this structure (scanner expects nodes under `src/nodetool/nodes`):

```text
your-package/
  pyproject.toml
  src/
    nodetool/
      nodes/
        mypack/
          math_nodes.py
      package_metadata/
```

## 2. Configure `pyproject.toml`

Minimal example:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "nodetool-mypack"
version = "0.1.0"
description = "Custom nodes for NodeTool"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
  "nodetool-core @ git+https://github.com/nodetool-ai/nodetool-core.git@main"
]

[tool.hatch.build.targets.wheel]
packages = ["src/nodetool"]
```

Use a package name starting with `nodetool-` so package discovery works as expected.

## 3. Implement a node

Example `src/nodetool/nodes/mypack/math_nodes.py`:

```python
from pydantic import Field

from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class AddOffsetNode(BaseNode):
    """Add an offset to a number."""

    value: float = Field(default=0.0, description="Input value")
    offset: float = Field(default=1.0, description="Amount to add")

    async def process(self, context: ProcessingContext) -> float:
        return self.value + self.offset
```

Notes:
- Inherit from `BaseNode`
- Define inputs as typed fields (`Field(...)` recommended)
- Implement `async def process(self, context) -> ...`
- Keep the class in a module importable as `nodetool.nodes.<namespace>.<module>`

## 4. Install in editable mode

In local development, use the conda env and install your package editable:

```bash
conda activate nodetool
pip install -e .
```

## 5. Run package scan

Generate package metadata after adding or changing nodes:

```bash
nodetool pack scan
```

`nodetool pack scan` (alias of `nodetool package scan`) will:
- scan `src/nodetool/nodes`
- collect node metadata
- write `src/nodetool/package_metadata/<project-name>.json`

## 6. Re-scan workflow

Repeat this loop during development:

1. edit node code
2. `pip install -e .` (if dependencies/package config changed)
3. `nodetool pack scan`

If scan fails, run with verbose output:

```bash
conda run -n nodetool nodetool pack scan -v
```
