# Common Issues and Solutions

This folder contains known issues and their solutions organized by topic. Each file documents a specific problem to help agents avoid redundant debugging.

## Folder Structure

```
issues/
├── typescript/        - TypeScript type errors and fixes
├── build/            - Build and bundling issues
├── testing/          - Test failures and configurations
├── linting/          - ESLint and type check issues
├── state-management/ - Zustand and React state issues
├── ui-styling/       - MUI, ReactFlow, and styling issues
├── api-backend/      - WebSocket, CORS, and API issues
├── dependencies/     - npm and package issues
├── git-ci/           - Git, CI/CD, and workflow issues
└── electron/         - Electron-specific issues
```

## File Naming Convention

Use descriptive, kebab-case names that summarize the issue:
- `reactflow-node-type-mismatches.md`
- `zustand-unnecessary-rerenders.md`
- `jest-module-not-found.md`

## File Format

Each issue file should follow this format:

```markdown
# Issue Title

**Problem**: One sentence describing the issue

**Solution**: One sentence or brief code snippet

**Why**: Brief explanation (optional)

**Files**: Related files (optional)

**Date**: YYYY-MM-DD (when documented)
```

## Adding New Issues

1. Identify the correct topic folder
2. Create a file with a descriptive name
3. Follow the format above
4. Keep content concise and actionable
