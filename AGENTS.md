# AGENTS.md

This file provides guidance to OpenAI's coding agents when working with code in this repository.

## Project Overview

NodeTool is an open-source, privacy-first, no-code platform for rapidly building and automating AI workflows. It enables users to create sophisticated AI solutions visually through a drag-and-drop interface with no coding required.

## Architecture

NodeTool follows a client-server architecture with multiple components:

1. **Frontend Components:**
   - Web UI (React/TypeScript): Visual editor for building AI workflows
   - Electron Wrapper: Packages the web UI into a desktop application
   - Apps UI: Standalone mini-applications created from workflows

2. **Backend Components:**
   - API Server: HTTP endpoints for workflow management
   - WebSocket Runner: Real-time communication during workflow execution
   - Workers: Execute AI models locally (CPU/GPU) or in the cloud

3. **Data Flow:**
   - User creates workflows in the editor
   - Workflows are executed through the WebSocket Runner
   - Workers process the workflow nodes (local or cloud)
   - Results are streamed back to the UI in real-time

## Key Directories

- `/web`: Main React web application (editor UI)
- `/electron`: Electron desktop app wrapper
- `/apps`: Mini-app builder components
- `/docs`: Documentation files
- `/scripts`: Build and release scripts

## Important Commands

### Development Setup

1. **Environment Activation:**
   ```bash
   conda activate nodetool
   ```

2. **Web UI Development:**
   ```bash
   cd web
   npm install
   npm start
   ```
   - Access at http://localhost:3000

3. **Electron App Development:**
   ```bash
   # Build the web UI first
   cd web
   npm install
   npm run build
   cd ..
   
   # Build the apps UI
   cd apps
   npm install
   npm run build
   cd ..
   
   # Run with Electron
   cd electron
   npm install
   npm start
   ```

### Build Commands

1. **Web UI Build:**
   ```bash
   cd web
   npm run build
   ```

2. **Apps UI Build:**
   ```bash
   cd apps
   npm run build
   ```

3. **Electron App Build:**
   ```bash
   cd electron
   npm run build
   ```

### Linting & Type Checking

1. **Web UI:**
   ```bash
   cd web
   npm run lint        # Run ESLint
   npm run lint:fix    # Fix linting issues
   npm run typecheck   # Check TypeScript types
   ```

2. **Apps UI:**
   ```bash
   cd apps
   npm run lint
   npm run lint:fix
   npm run typecheck
   ```

3. **Electron App:**
   ```bash
   cd electron
   npm run lint
   npm run lint:fix
   npm run typecheck
   ```

### Testing

1. **Web UI Tests:**
   ```bash
   cd web
   npm test
   ```

## Development Workflow

When working on this codebase:

1. Respect the component architecture in the frontend
2. Keep UI changes consistent with the existing design system
3. Use TypeScript for all new code
4. Run linting and type checking before submitting changes

## Technologies Used

- **Frontend:** React, TypeScript, Vite, Material UI, ReactFlow
- **Backend:** Python, FastAPI, WebSockets
- **AI Integration:** Supports Hugging Face, Ollama, OpenAI, Anthropic, and more
- **Packaging:** Electron for desktop app

## Project Structure

- The codebase is modular with clear separation between UI components and backend services
- The web UI follows a React component structure with stores for state management
- The electron app wraps the web UI and provides desktop integration features
- The apps component handles mini-app functionality