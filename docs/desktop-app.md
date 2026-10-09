---
layout: page
title: "Desktop App"
description: "What the NodeTool desktop app is, which platforms it supports, where it keeps your data, and how to update, find logs, and uninstall it."
permalink: /desktop-app
---

The desktop app is NodeTool packaged for Windows, macOS, and Linux. It opens the same editor as the web version in its own window and runs the NodeTool server on your machine, so your workflows, assets, and database stay local.

This page is the hub for desktop-specific questions. Installing and connecting a provider is covered in [Installation](installation.md). The windows, tray, and menus are cataloged in [Desktop App Views](electron-views.md).

---

## Platforms and downloads

Download the installer from [nodetool.ai](https://nodetool.ai). The release build produces:

| OS | Package | Architectures |
|----|---------|---------------|
| macOS | `.dmg` (and a `.zip`) | Apple Silicon (arm64) and Intel (x64) |
| Windows | NSIS installer (`.exe`) | x64 |
| Linux | AppImage, plus a Flatpak build | See [Installation](installation.md#linux) |

Step-by-step install instructions for each OS are in [Installation](installation.md#macos).

---

## First launch

NodeTool shows a boot splash while the local server starts. The first start can take longer than later ones, and the splash shows the current step. If the server does not start, the splash offers **Retry start**, **Open logs**, and **Reinstall environment**.

On macOS and Linux, NodeTool shows a one-time dialog explaining that it will use the system keychain to protect your stored API keys. Windows does not show it.

What is optional:

- **A Python environment.** Only nodes written in Python need it, such as HuggingFace and MLX nodes, and those nodes also need their pack from **Package Manager → Python packs**. NodeTool sets the environment up on demand, from **Tools → Package Manager** or when you run a workflow that needs it. See [What downloads later](installation.md#what-downloads-later).
- **Local model runners and models.** llama.cpp, whisper.cpp, and model files download only when you install them. Ollama is a separate download from [ollama.com](https://ollama.com). A cloud provider needs none of this.
- **A provider.** You do need one model source to run agents or generate media. See [Connect an AI provider](installation.md#connect-an-ai-provider).

---

## The local server

The app starts its own backend on `127.0.0.1`, so it is reachable only from your machine. It tries port 7777 first. If that port is taken, it uses the next free one, up to 50 ports higher. The tray menu shows the port in use ("NodeTool: Running on <port>"). The server starts when the app launches and stops when you quit.

If the app cannot reach its server on Windows, approve the firewall prompt. See [If installing goes wrong](installation.md#if-installing-goes-wrong).

---

## Where your data lives

Locations come from the app's code. Replace `~` with your home folder.

| What | macOS and Linux | Windows |
|------|-----------------|---------|
| Database, assets, and vector store | `~/.local/share/nodetool/` (or `$XDG_DATA_HOME/nodetool/`) | `%APPDATA%\nodetool\` |
| App settings (`settings.yaml`) | `~/.config/nodetool/` | `%APPDATA%\nodetool\` |
| Log file | `~/.local/share/nodetool/logs/nodetool.log` | `%LOCALAPPDATA%\nodetool\logs\nodetool.log` |
| Vaults | `~/.local/share/nodetool/vaults/<id>/` | `%LOCALAPPDATA%\nodetool\vaults\<id>\` |
| Python environment | macOS `~/nodetool_env`, Linux `~/.local/share/nodetool/conda_env` | `%ALLUSERSPROFILE%\nodetool\conda_env` |

The database file is `nodetool.sqlite3`, next to `assets/` and `vectorstore.db`. Provider keys are stored encrypted in that database. See [Connect an AI provider](installation.md#connect-an-ai-provider) for where the encryption key lives. Other settings and environment variables are listed in [Configuration](configuration.md).

---

## Desktop-only settings

Open **Settings** and look under **General → Workspace**. Three sections appear only in the desktop app.

**Updates**

- **Automatic Updates** is off by default. Turn it on to have the app check for and download updates in the background. It only runs in installed (packaged) builds.
- **Update Channel** is **Stable** (full releases) or **Nightly** (prerelease builds). Nightly builds default to the Nightly channel.
- **On Close Behavior** sets what closing the main window does: **Ask Every Time**, **Quit Application**, or **Keep Running in Background**. The same choice is in the tray menu.

When an update is ready, a notice appears at the top right of the main window. See [Update Notification](electron-views.md#update-notification).

**Vaults**

A vault is a separate data store with its own database, assets, and RAG collections. Use vaults to keep different sets of workflows and data apart. In **Settings → Vaults** you can create a vault, **Switch** to it, **Rename** it, or **Delete** it. The built-in default vault cannot be renamed or deleted, and you cannot delete the active vault. Switching restarts the backend and reloads the window. You can also switch from the **Vaults** menu in the menu bar. Vaults use SQLite, so they are skipped when an external `DATABASE_URL` is set.

---

## Package Manager

Open **Tools → Package Manager** to install system runtimes (such as Python and the model runners) and to enable, disable, install, or update node packs. See [Desktop App Views](electron-views.md#package-manager) for the screen and [Node Packs](node-packs.md) for where packs come from.

---

## Tray and menus

NodeTool keeps a tray icon while it runs. From it you can start or stop the service, show the window, open chat, mini apps, the Log Viewer, and Settings, and quit. The full item lists for the tray and the menu bar are in [Desktop App Views](electron-views.md#system-tray).

---

## Logs

Use **Tools → Log Viewer** to read the server log in the app, or **Open Log File** in the tray menu to open the raw file at the path in the table above. **Help → System Information** lists the app version, OS details, and the data, conda, and log paths, with a **Copy to Clipboard** button. Include it when you ask for help. For common problems see [Troubleshooting](troubleshooting.md).

---

## Uninstalling

Uninstalling removes the application files only. Your data, settings, logs, and Python environment stay on disk, and the Windows uninstaller keeps them on purpose. Steps for each OS are in [Uninstalling](installation.md#uninstalling). To remove everything, also delete the folders in [Where your data lives](#where-your-data-lives).

---

## Related

- [Installation](installation.md)
- [Desktop App Views](electron-views.md)
- [Self-Hosted Deployment](self-hosted-deployment.md) for running the server without the desktop app
- [Configuration](configuration.md)
