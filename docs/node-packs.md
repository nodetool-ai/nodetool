______________________________________________________________________

## layout: default title: Node Packs

Node Packs extend NodeTool with additional nodes and integrations. Packs are distributed through the public registry and
can be installed directly from the app.

The Packs page is available from the desktop app under “Tools → Packs”. Installed packs automatically extend the Node
Menu with new namespaces.

### Finding packs

Install and manage packs directly from the desktop app.

- Open Package Manager: Launch the Electron desktop app, then open the Package Manager from the Tools menu.
- Browse and search packages: Use the top search box to filter by package name, description, or repo id.
- Search nodes across packs: Use the “Search nodes” field to find nodes by title, description, or type. You can install
  the required pack directly from node results.

### Installing or removing packs

- Click **Install** to add a pack. The pack will be installed as a pip package.
- Use **Uninstall** to remove a pack you no longer need.
- Packs can also be updated from the same screen when new versions are released.

Packs can include:
– new node definitions
– python dependencies
– workflow templates
– tools accessible from Global Chat

### Command line alternative

If you prefer the terminal, run `nodetool package list -a` to see every pack. Install one with
`pip install git+https://github.com/nodetool-ai/<pack-name>`. Advanced users can manage versions this way.

### Publishing your own pack

The NodeTool Packs Registry on GitHub explains how to create and publish packs. Following those guidelines lets others
discover and install your work easily.
