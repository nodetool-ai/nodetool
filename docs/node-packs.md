---
layout: default
title: Node Packs
---

Node Packs extend NodeTool with additional nodes and integrations. Packs are distributed through the public registry and can be installed directly from the app.

### Finding packs

When starting the Nodetool app you can select packs to install or uninstall.

### Installing or removing packs

- Click **Install** to add a pack. The pack will be installed as a pip package.
- Use **Uninstall** to remove a pack you no longer need.
- Packs can also be updated from the same screen when new versions are released.

### Command line alternative

If you prefer the terminal, run `nodetool package list -a` to see every pack. Install one with `pip install git+https://github.com/nodetool-ai/<pack-name>`. Advanced users can manage versions this way.

### Publishing your own pack

The NodeTool Packs Registry on GitHub explains how to create and publish packs. Following those guidelines lets others discover and install your work easily.

