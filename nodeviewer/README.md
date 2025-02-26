# NodeViewer

A simplified standalone version of a React Flow graph visualization without interactive functionality.

## Overview

This project is a simplified version of a node-based workflow editor that uses React Flow to display graphs and nodes. It's designed to be a lightweight, read-only version that can be used to display workflows without the interactive functionality of the full editor.

## Features

- Display nodes with properties and connections
- Render node inputs and outputs with appropriate handles
- Show node metadata and type information
- Visualize connections between nodes
- Minimal, clean UI focused on visualization

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
cd nodeviewer
npm install
```

### Running the Application

```bash
npm start
```

This will start the development server and open the application in your default browser.

## Project Structure

- `src/components/` - React components for the application
- `src/stores/` - State management using Zustand
- `src/styles/` - CSS styles for the application

## Key Components

- `SimpleNodeStore.ts` - Manages the state of nodes and edges
- `SimpleBaseNode.tsx` - Renders a single node in the workflow
- `SimpleReactFlowWrapper.tsx` - Renders the React Flow graph
- `SimpleApp.tsx` - Main application component

## License

MIT
