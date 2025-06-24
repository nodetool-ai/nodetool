---
layout: default
title: Node Packs
---

Node Packs extend NodeTool with additional nodes and integrations. Packs are distributed through the public registry and can be installed directly from the app.

### Finding packs

Open **Settings** and choose **Packs** to browse what is available. Each entry lists the new nodes it adds and any extra requirements.

### Installing or removing packs

- Click **Install** to add a pack. The download happens in the background and new nodes appear in the Node Menu when it finishes.
- Use **Uninstall** to remove a pack you no longer need.
- Packs can also be updated from the same screen when new versions are released.

### Command line alternative

If you prefer the terminal, run `nodetool package list -a` to see every pack. Install one with `pip install git+https://github.com/nodetool-ai/<pack-name>`. Advanced users can manage versions this way.

### Publishing your own pack

The NodeTool Packs Registry on GitHub explains how to create and publish packs. Following those guidelines lets others discover and install your work easily.

