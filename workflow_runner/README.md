# Workflow Runner

A lightweight web interface that connects to the NodeTool backend via WebSockets.
It can be served as a static page and is used by the desktop app to display
workflow progress and chat logs during execution.

Files:

- `index.html` – entry point for the runner UI
- `js/` – frontend logic for connecting to the WebSocket API
- `styles/` – simple styling for the runner page

Open `index.html` in a browser after starting the NodeTool server to see live
workflow updates.
