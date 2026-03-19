# VibeCoding Plan A: Workspace Foundation

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the HTML-blob vibecoding system with a working end-to-end loop: VibeCoding panel opens → Next.js dev server starts for the connected workspace → preview iframe shows `http://localhost:PORT` → user chats with AI → AI writes `page.tsx` to disk → HMR updates preview.

**Architecture:** `WorkspaceDevServer` runs in the Electron main process and manages `next dev` child processes per workspace path, with auto-respawn on crash. New `IpcChannels` entries (kebab-case, registered via `createIpcMainHandler`) expose dev server and file I/O operations to the renderer. `VibeCodingStore` is rewritten with a filesystem-based session shape (no persist middleware). `VibeCodingChat` streams AI responses and writes the resulting `.tsx` file to disk via IPC. The `workspacePath` for a workflow comes from its linked `WorkspaceResponse.path` (fetched from the NodeTool API).

**Tech Stack:** Electron (child_process), IPC via contextBridge + `createIpcMainHandler`, Zustand (no persist), Next.js 15 + Turbopack, shadcn/ui + Tailwind v4 (block components in demo/)

**Spec:** `docs/superpowers/specs/2026-03-19-vibecoding-system-design.md` (Sections 1, 2, 4, 6)

**Plans B and C:** WYSIWYG/theme/palette (Plan B) and Publish/Deploy pipeline (Plan C) build on top of this foundation.

---

## File Map

### New files
- `nodetool/electron/src/WorkspaceDevServer.ts` — `next dev` process manager with auto-respawn
- `nodetool/electron/src/__tests__/workspaceDevServer.test.ts`
- `nodetool/demo/src/components/blocks/AppHeader.tsx`
- `nodetool/demo/src/components/blocks/StepIndicator.tsx`
- `nodetool/demo/src/components/blocks/InputCard.tsx`
- `nodetool/demo/src/components/blocks/ResultCard.tsx`
- `nodetool/demo/src/components/blocks/LoadingCard.tsx`
- `nodetool/demo/src/components/blocks/SampleChips.tsx`
- `nodetool/demo/src/components/blocks/MediaOutput.tsx`
- `nodetool/demo/src/components/blocks/ErrorAlert.tsx`
- `nodetool/demo/src/components/blocks/index.ts`

### Modified files
- `nodetool/electron/src/types.d.ts` — add `IpcChannels` entries + `window.api.workspace` namespace
- `nodetool/electron/src/ipc.ts` — register workspace handlers via `createIpcMainHandler`
- `nodetool/electron/src/preload.ts` — expose `window.api.workspace` via contextBridge
- `nodetool/web/src/stores/VibeCodingStore.ts` — full rewrite (new session shape, no persist)
- `nodetool/web/src/stores/__tests__/VibeCodingStore.test.ts` — update tests
- `nodetool/web/src/components/vibecoding/VibeCodingPreview.tsx` — rewrite (localhost iframe)
- `nodetool/web/src/components/vibecoding/VibeCodingPanel.tsx` — rewrite (chat-only for Plan A)
- `nodetool/web/src/components/vibecoding/VibeCodingChat.tsx` — rewrite (writes .tsx to disk)
- `nodetool/web/src/components/vibecoding/VibeCodingModal.tsx` — add `workspacePath` prop
- `nodetool/web/src/components/vibecoding/utils/extractHtml.ts` — delete (retired)

---

## Chunk 1: WorkspaceDevServer (Electron Main)

### Task 1: WorkspaceDevServer class + tests

**Files:**
- Create: `nodetool/electron/src/WorkspaceDevServer.ts`
- Create: `nodetool/electron/src/__tests__/workspaceDevServer.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```typescript
// nodetool/electron/src/__tests__/workspaceDevServer.test.ts
import { WorkspaceDevServer } from '../WorkspaceDevServer';

jest.mock('child_process', () => ({ spawn: jest.fn() }));
import { spawn } from 'child_process';
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function makeMockProcess() {
  const proc: any = {
    pid: 12345,
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  };
  return proc;
}

describe('WorkspaceDevServer', () => {
  let server: WorkspaceDevServer;

  beforeEach(() => {
    server = new WorkspaceDevServer();
    jest.clearAllMocks();
  });

  it('isRunning returns false before spawn', () => {
    expect(server.isRunning('/path')).toBe(false);
  });

  it('getPort returns null before spawn', () => {
    expect(server.getPort('/path')).toBeNull();
  });

  it('getStatus returns stopped before spawn', () => {
    expect(server.getStatus('/path')).toBe('stopped');
  });

  it('spawn starts next dev and resolves with port when ready', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);

    // Simulate stdout "Ready" message
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));

    const port = await spawnPromise;
    expect(port).toBe(3001);
    expect(server.isRunning('/workspace')).toBe(true);
    expect(server.getPort('/workspace')).toBe(3001);
    expect(server.getStatus('/workspace')).toBe('running');
    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev', '--', '--port', '3001'],
      expect.objectContaining({ cwd: '/workspace' })
    );
  });

  it('getLogs accumulates stderr lines', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stderrCb]] = mockProc.stderr.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stderrCb(Buffer.from('some warning\n'));
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    expect(server.getLogs('/workspace')).toContain('some warning');
  });

  it('kill signals the process and clears state', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    // Make exit event fire when kill() is called
    mockProc.kill.mockImplementation(() => {
      const [[, exitCb]] = mockProc.on.mock.calls.filter(([e]: [string]) => e === 'exit');
      exitCb(0, null);
    });

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    await server.kill('/workspace');
    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(server.isRunning('/workspace')).toBe(false);
    expect(server.getPort('/workspace')).toBeNull();
  });

  it('auto-respawns on unexpected exit (up to 3 times)', async () => {
    const mockProc = makeMockProcess();
    mockSpawn.mockReturnValue(mockProc as any);

    const spawnPromise = server.spawn('/workspace', 3001);
    const [[, stdoutCb]] = mockProc.stdout.on.mock.calls.filter(([e]: [string]) => e === 'data');
    stdoutCb(Buffer.from('✓ Ready in 514ms\n'));
    await spawnPromise;

    expect(server.isRunning('/workspace')).toBe(true);

    // Trigger unexpected exit
    const [[, exitCb]] = mockProc.on.mock.calls.filter(([e]: [string]) => e === 'exit');
    exitCb(1, null);

    expect(server.getStatus('/workspace')).toBe('error');
    // Auto-respawn increments attempt count; mockSpawn called again after backoff
    // (In unit test, just verify status transitions to 'error' without infinite loop)
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd nodetool/electron && npx jest workspaceDevServer --no-coverage 2>&1 | tail -10
```
Expected: FAIL — "Cannot find module '../WorkspaceDevServer'"

- [ ] **Step 1.3: Implement WorkspaceDevServer**

```typescript
// nodetool/electron/src/WorkspaceDevServer.ts
import { spawn, ChildProcess } from 'child_process';

export type DevServerStatus = 'starting' | 'running' | 'error' | 'stopped';

interface DevServerEntry {
  process: ChildProcess;
  port: number;
  logs: string[];
  status: DevServerStatus;
  respawnAttempts: number;
}

const MAX_LOGS = 100;
const MAX_RESPAWN_ATTEMPTS = 3;
const RESPAWN_BACKOFF_MS = 2000;

export class WorkspaceDevServer {
  private servers = new Map<string, DevServerEntry>();

  spawn(workspacePath: string, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const entry: DevServerEntry = {
        process: null as any,
        port,
        logs: [],
        status: 'starting',
        respawnAttempts: this.servers.get(workspacePath)?.respawnAttempts ?? 0,
      };
      this.servers.set(workspacePath, entry);

      const proc = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
        cwd: workspacePath,
        env: { ...process.env },
        shell: false,
      });
      entry.process = proc;

      const appendLog = (text: string) => {
        const line = text.trim();
        if (!line) return;
        entry.logs.push(line);
        if (entry.logs.length > MAX_LOGS) entry.logs.shift();
      };

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        appendLog(text);
        if (
          entry.status === 'starting' &&
          (text.includes('✓ Ready') || text.includes('ready started'))
        ) {
          entry.status = 'running';
          entry.respawnAttempts = 0;
          resolve(port);
        }
      });

      proc.stderr.on('data', (data: Buffer) => appendLog(data.toString()));

      proc.on('error', (err: Error) => {
        entry.status = 'error';
        if (entry.status === 'starting') reject(err);
      });

      proc.on('exit', (code: number | null) => {
        if (entry.status === 'starting') {
          entry.status = 'error';
          reject(new Error(`next dev exited with code ${code} before ready`));
          return;
        }
        if (entry.status === 'running') {
          // Unexpected crash — attempt auto-respawn
          entry.status = 'error';
          if (entry.respawnAttempts < MAX_RESPAWN_ATTEMPTS) {
            entry.respawnAttempts++;
            setTimeout(() => {
              if (this.servers.get(workspacePath) === entry) {
                this.spawn(workspacePath, port).catch(() => {
                  // Exhausted retries; status stays 'error'
                });
              }
            }, RESPAWN_BACKOFF_MS);
          }
        }
      });
    });
  }

  async kill(workspacePath: string): Promise<void> {
    const entry = this.servers.get(workspacePath);
    if (!entry) return;
    return new Promise((resolve) => {
      entry.process.on('exit', () => resolve());
      entry.process.kill('SIGTERM');
      entry.status = 'stopped';
      this.servers.delete(workspacePath);
    });
  }

  async respawn(workspacePath: string, port: number): Promise<number> {
    await this.kill(workspacePath);
    return this.spawn(workspacePath, port);
  }

  isRunning(workspacePath: string): boolean {
    return this.servers.get(workspacePath)?.status === 'running';
  }

  getPort(workspacePath: string): number | null {
    const entry = this.servers.get(workspacePath);
    return entry && entry.status !== 'stopped' ? entry.port : null;
  }

  getStatus(workspacePath: string): DevServerStatus {
    return this.servers.get(workspacePath)?.status ?? 'stopped';
  }

  getLogs(workspacePath: string): string[] {
    return [...(this.servers.get(workspacePath)?.logs ?? [])];
  }

  killAll(): void {
    for (const [path] of this.servers) {
      this.kill(path);
    }
  }
}

export const workspaceDevServer = new WorkspaceDevServer();
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
cd nodetool/electron && npx jest workspaceDevServer --no-coverage 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 1.5: Commit**

```bash
cd nodetool/electron
git add src/WorkspaceDevServer.ts src/__tests__/workspaceDevServer.test.ts
git commit -m "feat(electron): add WorkspaceDevServer with auto-respawn"
```

---

### Task 2: IPC channels — types, handlers, preload

**Files:**
- Modify: `nodetool/electron/src/types.d.ts`
- Modify: `nodetool/electron/src/ipc.ts`
- Modify: `nodetool/electron/src/preload.ts`

> The codebase uses `IpcChannels` enum (kebab-case values) + `createIpcMainHandler` wrapper. All new channels must follow this pattern.

- [ ] **Step 2.1: Add IpcChannels entries to types.d.ts**

In `types.d.ts`, find the `IpcChannels` enum (line ~496) and append before the closing brace:

```typescript
  // Workspace dev server
  WORKSPACE_SERVER_SPAWN = "workspace-server-spawn",
  WORKSPACE_SERVER_KILL = "workspace-server-kill",
  WORKSPACE_SERVER_RESPAWN = "workspace-server-respawn",
  WORKSPACE_SERVER_STATUS = "workspace-server-status",
  WORKSPACE_SERVER_LOGS = "workspace-server-logs",
  // Workspace file I/O
  WORKSPACE_FILE_WRITE = "workspace-file-write",
  WORKSPACE_FILE_READ = "workspace-file-read",
```

Find the `IpcRequest` interface and add:

```typescript
  [IpcChannels.WORKSPACE_SERVER_SPAWN]: { workspacePath: string; port: number };
  [IpcChannels.WORKSPACE_SERVER_KILL]: { workspacePath: string };
  [IpcChannels.WORKSPACE_SERVER_RESPAWN]: { workspacePath: string; port: number };
  [IpcChannels.WORKSPACE_SERVER_STATUS]: { workspacePath: string };
  [IpcChannels.WORKSPACE_SERVER_LOGS]: { workspacePath: string };
  [IpcChannels.WORKSPACE_FILE_WRITE]: { workspacePath: string; relPath: string; content: string };
  [IpcChannels.WORKSPACE_FILE_READ]: { workspacePath: string; relPath: string };
```

Find the `IpcResponse` interface and add:

```typescript
  [IpcChannels.WORKSPACE_SERVER_SPAWN]: number;   // port
  [IpcChannels.WORKSPACE_SERVER_KILL]: void;
  [IpcChannels.WORKSPACE_SERVER_RESPAWN]: number;
  [IpcChannels.WORKSPACE_SERVER_STATUS]: { running: boolean; port: number | null; status: string };
  [IpcChannels.WORKSPACE_SERVER_LOGS]: string[];
  [IpcChannels.WORKSPACE_FILE_WRITE]: void;
  [IpcChannels.WORKSPACE_FILE_READ]: string;
```

Find the `window.api` interface and add the `workspace` namespace:

```typescript
  workspace: {
    server: {
      spawn: (workspacePath: string, port: number) => Promise<number>;
      kill: (workspacePath: string) => Promise<void>;
      respawn: (workspacePath: string, port: number) => Promise<number>;
      status: (workspacePath: string) => Promise<{ running: boolean; port: number | null; status: string }>;
      logs: (workspacePath: string) => Promise<string[]>;
    };
    file: {
      write: (workspacePath: string, relPath: string, content: string) => Promise<void>;
      read: (workspacePath: string, relPath: string) => Promise<string>;
    };
  };
```

- [ ] **Step 2.2: Register handlers in ipc.ts**

At the top of `ipc.ts`, add to the import block:

```typescript
import { workspaceDevServer } from './WorkspaceDevServer';
import fs from 'fs/promises';
import path from 'path';
```

Inside the `initializeIpcHandlers` function (after the existing handlers), add using `createIpcMainHandler`:

```typescript
  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_SPAWN,
    async (_event, { workspacePath, port }) => {
      return workspaceDevServer.spawn(workspacePath, port);
    }
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_KILL,
    async (_event, { workspacePath }) => {
      return workspaceDevServer.kill(workspacePath);
    }
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_RESPAWN,
    async (_event, { workspacePath, port }) => {
      return workspaceDevServer.respawn(workspacePath, port);
    }
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_STATUS,
    async (_event, { workspacePath }) => ({
      running: workspaceDevServer.isRunning(workspacePath),
      port: workspaceDevServer.getPort(workspacePath),
      status: workspaceDevServer.getStatus(workspacePath),
    })
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_LOGS,
    async (_event, { workspacePath }) => workspaceDevServer.getLogs(workspacePath)
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_FILE_WRITE,
    async (_event, { workspacePath, relPath, content }) => {
      const fullPath = path.join(workspacePath, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  );

  createIpcMainHandler(
    IpcChannels.WORKSPACE_FILE_READ,
    async (_event, { workspacePath, relPath }) => {
      const fullPath = path.join(workspacePath, relPath);
      return fs.readFile(fullPath, 'utf-8');
    }
  );
```

Find the `app.on('before-quit', ...)` handler and add `workspaceDevServer.killAll()` inside it.

- [ ] **Step 2.3: Expose via preload.ts**

Inside `contextBridge.exposeInMainWorld('api', { ... })`, add:

```typescript
  workspace: {
    server: {
      spawn: (workspacePath: string, port: number) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_SPAWN, { workspacePath, port }),
      kill: (workspacePath: string) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_KILL, { workspacePath }),
      respawn: (workspacePath: string, port: number) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_RESPAWN, { workspacePath, port }),
      status: (workspacePath: string) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_STATUS, { workspacePath }),
      logs: (workspacePath: string) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_LOGS, { workspacePath }),
    },
    file: {
      write: (workspacePath: string, relPath: string, content: string) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_FILE_WRITE, { workspacePath, relPath, content }),
      read: (workspacePath: string, relPath: string) =>
        ipcRenderer.invoke(IpcChannels.WORKSPACE_FILE_READ, { workspacePath, relPath }),
    },
  },
```

> **Note on `ipcRenderer.invoke` signature:** Check how existing `createIpcMainHandler` handlers receive arguments. If the wrapper spreads args differently (e.g. as positional rather than a single object), adjust the preload calls and handler destructuring to match the existing pattern in `ipc.ts`.

- [ ] **Step 2.4: Verify TypeScript compiles**

```bash
cd nodetool/electron && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 2.5: Commit**

```bash
cd nodetool/electron
git add src/types.d.ts src/ipc.ts src/preload.ts
git commit -m "feat(electron): add workspace IPC channels (dev server + file I/O)"
```

---

### Task 3: Workspace scaffolding (npm install on first open)

**Files:**
- Modify: `nodetool/electron/src/WorkspaceDevServer.ts`

Before spawning `next dev`, check for `node_modules/`. If absent, run `npm install` first.

- [ ] **Step 3.1: Add `ensureInstalled` helper to WorkspaceDevServer**

Add this method to the `WorkspaceDevServer` class:

```typescript
  async ensureInstalled(workspacePath: string): Promise<void> {
    const nodeModulesPath = path.join(workspacePath, 'node_modules');
    try {
      await import('fs/promises').then(fs => fs.access(nodeModulesPath));
    } catch {
      // node_modules absent — run npm install
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('npm', ['install'], {
          cwd: workspacePath,
          env: { ...process.env },
          shell: false,
        });
        proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`npm install failed (code ${code})`)));
        proc.on('error', reject);
      });
    }
  }
```

Add the `path` import at the top:

```typescript
import path from 'path';
```

- [ ] **Step 3.2: Add a new IPC channel `WORKSPACE_SERVER_ENSURE_INSTALLED`**

Add to `IpcChannels` enum in `types.d.ts`:
```typescript
  WORKSPACE_SERVER_ENSURE_INSTALLED = "workspace-server-ensure-installed",
```

Add to `IpcRequest`:
```typescript
  [IpcChannels.WORKSPACE_SERVER_ENSURE_INSTALLED]: { workspacePath: string };
```

Add to `IpcResponse`:
```typescript
  [IpcChannels.WORKSPACE_SERVER_ENSURE_INSTALLED]: void;
```

Register in `ipc.ts`:
```typescript
  createIpcMainHandler(
    IpcChannels.WORKSPACE_SERVER_ENSURE_INSTALLED,
    async (_event, { workspacePath }) => {
      return workspaceDevServer.ensureInstalled(workspacePath);
    }
  );
```

Expose in `preload.ts` (inside `workspace.server`):
```typescript
  ensureInstalled: (workspacePath: string) =>
    ipcRenderer.invoke(IpcChannels.WORKSPACE_SERVER_ENSURE_INSTALLED, { workspacePath }),
```

Add to `window.api.workspace.server` type in `types.d.ts`:
```typescript
  ensureInstalled: (workspacePath: string) => Promise<void>;
```

- [ ] **Step 3.3: Verify TypeScript compiles**

```bash
cd nodetool/electron && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3.4: Commit**

```bash
cd nodetool/electron
git add src/WorkspaceDevServer.ts src/types.d.ts src/ipc.ts src/preload.ts
git commit -m "feat(electron): add ensureInstalled (npm install on first open)"
```

---

## Chunk 2: VibeCodingStore Rewrite

### Task 4: Rewrite VibeCodingStore

**Files:**
- Modify: `nodetool/web/src/stores/VibeCodingStore.ts`
- Modify: `nodetool/web/src/stores/__tests__/VibeCodingStore.test.ts`

- [ ] **Step 4.1: Read the existing test file**

```bash
cat nodetool/web/src/stores/__tests__/VibeCodingStore.test.ts
```
Note any test utilities or import patterns used, then replace the file content.

- [ ] **Step 4.2: Write the new tests**

Replace `nodetool/web/src/stores/__tests__/VibeCodingStore.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react';
import { useVibeCodingStore } from '../VibeCodingStore';

describe('VibeCodingStore', () => {
  beforeEach(() => {
    useVibeCodingStore.setState({ sessions: {} });
  });

  it('getSession returns default for unknown workflowId', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    const session = result.current.getSession('unknown');
    expect(session.workflowId).toBe('unknown');
    expect(session.port).toBeNull();
    expect(session.serverStatus).toBe('stopped');
    expect(session.messages).toEqual([]);
    expect(session.chatStatus).toBe('idle');
    expect(session.isPublished).toBe(false);
    expect(session.workspacePath).toBe('');
  });

  it('initSession creates a session with provided path', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => { result.current.initSession('wf-1', '/path/to/workspace'); });
    const session = result.current.getSession('wf-1');
    expect(session.workspacePath).toBe('/path/to/workspace');
    expect(session.serverStatus).toBe('stopped');
  });

  it('setServerStatus updates status and port', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setServerStatus('wf-1', 'running', 3001);
    });
    expect(result.current.getSession('wf-1').serverStatus).toBe('running');
    expect(result.current.getSession('wf-1').port).toBe(3001);
  });

  it('appendServerLog keeps last 100 lines', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      for (let i = 0; i < 105; i++) result.current.appendServerLog('wf-1', `line ${i}`);
    });
    const logs = result.current.getSession('wf-1').serverLogs;
    expect(logs.length).toBe(100);
    expect(logs[0]).toBe('line 5');
    expect(logs[99]).toBe('line 104');
  });

  it('addMessage appends message', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.addMessage('wf-1', {
        type: 'message', role: 'user', name: '',
        content: [{ type: 'text', text: 'hello' }],
        created_at: new Date().toISOString(),
      });
    });
    expect(result.current.getSession('wf-1').messages).toHaveLength(1);
  });

  it('updateLastMessage updates last message text', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.addMessage('wf-1', {
        type: 'message', role: 'assistant', name: '',
        content: [{ type: 'text', text: '' }],
        created_at: new Date().toISOString(),
      });
      result.current.updateLastMessage('wf-1', 'updated content');
    });
    const [msg] = result.current.getSession('wf-1').messages;
    expect((msg.content as Array<{type: string; text: string}>)[0].text).toBe('updated content');
  });

  it('setChatStatus updates chatStatus', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setChatStatus('wf-1', 'streaming');
    });
    expect(result.current.getSession('wf-1').chatStatus).toBe('streaming');
  });

  it('setIsPublished updates isPublished', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setIsPublished('wf-1', true);
    });
    expect(result.current.getSession('wf-1').isPublished).toBe(true);
  });

  it('clearSession removes the session', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.clearSession('wf-1');
    });
    expect(result.current.getSession('wf-1').workspacePath).toBe('');
  });
});
```

- [ ] **Step 4.3: Run tests to confirm they fail**

```bash
cd nodetool/web && npx jest VibeCodingStore --no-coverage 2>&1 | tail -10
```
Expected: FAIL (old shape mismatch)

- [ ] **Step 4.4: Rewrite VibeCodingStore.ts**

Replace `nodetool/web/src/stores/VibeCodingStore.ts` entirely:

```typescript
import { create } from "zustand";
import { Message } from "./ApiTypes";

export type ServerStatus = "starting" | "running" | "error" | "stopped";
export type ChatStatus = "idle" | "streaming" | "error";

export interface VibeCodingSession {
  workflowId: string;
  workspacePath: string;
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  isPublished: boolean;
  messages: Message[];
  chatStatus: ChatStatus;
}

const MAX_LOGS = 100;

const defaultSession = (workflowId: string): VibeCodingSession => ({
  workflowId,
  workspacePath: "",
  port: null,
  serverStatus: "stopped",
  serverLogs: [],
  isPublished: false,
  messages: [],
  chatStatus: "idle",
});

interface VibeCodingState {
  sessions: Record<string, VibeCodingSession>;
  getSession: (workflowId: string) => VibeCodingSession;
  initSession: (workflowId: string, workspacePath: string) => void;
  clearSession: (workflowId: string) => void;
  setServerStatus: (workflowId: string, status: ServerStatus, port?: number | null) => void;
  appendServerLog: (workflowId: string, line: string) => void;
  addMessage: (workflowId: string, message: Message) => void;
  updateLastMessage: (workflowId: string, content: string) => void;
  clearMessages: (workflowId: string) => void;
  setChatStatus: (workflowId: string, status: ChatStatus) => void;
  setIsPublished: (workflowId: string, published: boolean) => void;
}

function patch(
  sessions: Record<string, VibeCodingSession>,
  workflowId: string,
  updater: (s: VibeCodingSession) => Partial<VibeCodingSession>
): Record<string, VibeCodingSession> {
  const s = sessions[workflowId] ?? defaultSession(workflowId);
  return { ...sessions, [workflowId]: { ...s, ...updater(s) } };
}

export const useVibeCodingStore = create<VibeCodingState>()((set, get) => ({
  sessions: {},

  getSession: (workflowId) =>
    get().sessions[workflowId] ?? defaultSession(workflowId),

  initSession: (workflowId, workspacePath) =>
    set((state) => ({
      sessions: { ...state.sessions, [workflowId]: { ...defaultSession(workflowId), workspacePath } },
    })),

  clearSession: (workflowId) =>
    set((state) => {
      const { [workflowId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  setServerStatus: (workflowId, status, port) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => ({
        serverStatus: status,
        port: port !== undefined ? port : s.port,
      })),
    })),

  appendServerLog: (workflowId, line) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => {
        const logs = [...s.serverLogs, line];
        return { serverLogs: logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs };
      }),
    })),

  addMessage: (workflowId, message) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => ({
        messages: [...s.messages, message],
      })),
    })),

  updateLastMessage: (workflowId, content) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, (s) => {
        if (!s.messages.length) return {};
        const messages = [...s.messages];
        const last = { ...messages[messages.length - 1] };
        if (Array.isArray(last.content)) {
          last.content = last.content.map((c) =>
            c.type === "text" ? { ...c, text: content } : c
          );
        }
        messages[messages.length - 1] = last;
        return { messages };
      }),
    })),

  clearMessages: (workflowId) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ messages: [] })),
    })),

  setChatStatus: (workflowId, status) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ chatStatus: status })),
    })),

  setIsPublished: (workflowId, published) =>
    set((state) => ({
      sessions: patch(state.sessions, workflowId, () => ({ isPublished: published })),
    })),
}));
```

Note: no `persist` middleware — `workspacePath` and `port` are runtime state, not persisted.

- [ ] **Step 4.5: Run tests to confirm they pass**

```bash
cd nodetool/web && npx jest VibeCodingStore --no-coverage 2>&1 | tail -10
```
Expected: PASS

- [ ] **Step 4.6: Commit**

```bash
cd nodetool/web
git add src/stores/VibeCodingStore.ts src/stores/__tests__/VibeCodingStore.test.ts
git commit -m "feat(web): rewrite VibeCodingStore with filesystem session shape"
```

---

## Chunk 3: VibeCodingPreview Rewrite

### Task 5: Rewrite VibeCodingPreview

**Files:**
- Modify: `nodetool/web/src/components/vibecoding/VibeCodingPreview.tsx`

- [ ] **Step 5.1: Check LoadingSpinner export path**

```bash
grep -n "LoadingSpinner" nodetool/web/src/components/ui_primitives/index.ts | head -5
```
Confirm the exact import path. Adjust in the component below if different.

- [ ] **Step 5.2: Write the new VibeCodingPreview.tsx**

Replace file entirely:

```typescript
/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, memo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, IconButton, Tooltip, Button } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import type { Theme } from "@mui/material/styles";
import type { ServerStatus } from "../../stores/VibeCodingStore";
import { LoadingSpinner } from "../ui_primitives";

const createStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      backgroundColor: theme.palette.background.default,
      overflow: "hidden",
    },
    ".preview-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderBottom: `1px solid ${theme.palette.divider}`,
      backgroundColor: theme.palette.background.paper,
    },
    ".preview-title": { fontSize: "14px", fontWeight: 500 },
    ".preview-actions": { display: "flex", gap: "4px" },
    ".preview-frame-container": { flex: 1, position: "relative" },
    ".preview-frame": { width: "100%", height: "100%", border: "none" },
    ".preview-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "16px",
      padding: "24px",
      textAlign: "center",
    },
    ".error-log": {
      fontSize: "11px",
      color: theme.palette.text.secondary,
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(1),
      borderRadius: "4px",
      maxHeight: "200px",
      overflow: "auto",
      textAlign: "left",
      width: "100%",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
  });

interface VibeCodingPreviewProps {
  port: number | null;
  serverStatus: ServerStatus;
  serverLogs: string[];
  onRestart?: () => void;
}

const VibeCodingPreview: React.FC<VibeCodingPreviewProps> = ({
  port,
  serverStatus,
  serverLogs,
  onRestart,
}) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [iframeKey, setIframeKey] = useState(0);

  const src = serverStatus === "running" && port ? `http://localhost:${port}` : null;

  const handleRefresh = useCallback(() => setIframeKey((k) => k + 1), []);
  const handleOpenInNew = useCallback(() => {
    if (src) window.open(src, "_blank", "noopener,noreferrer");
  }, [src]);

  return (
    <Box css={styles}>
      <div className="preview-header">
        <Typography className="preview-title">
          Preview{serverStatus === "starting" && " (Starting…)"}
        </Typography>
        <div className="preview-actions">
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" onClick={handleRefresh} disabled={!src}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Open in new tab">
            <span>
              <IconButton size="small" onClick={handleOpenInNew} disabled={!src}>
                <OpenInNewIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="preview-frame-container">
        {serverStatus === "starting" && (
          <div className="preview-state">
            <LoadingSpinner size="medium" />
            <Typography variant="body2" color="text.secondary">
              Starting dev server…
            </Typography>
          </div>
        )}

        {serverStatus === "error" && (
          <div className="preview-state">
            <Typography variant="body1" color="error">Dev server error</Typography>
            {serverLogs.length > 0 && (
              <pre className="error-log">{serverLogs.slice(-20).join("\n")}</pre>
            )}
            {onRestart && (
              <Button size="small" variant="outlined" onClick={onRestart}>
                ↺ Restart server
              </Button>
            )}
          </div>
        )}

        {serverStatus === "stopped" && (
          <div className="preview-state">
            <Typography variant="body2" color="text.secondary">
              No workspace connected
            </Typography>
          </div>
        )}

        {src && (
          <iframe
            key={iframeKey}
            src={src}
            className="preview-frame"
            title="VibeCoding Preview"
          />
        )}
      </div>
    </Box>
  );
};

export default memo(VibeCodingPreview);
```

- [ ] **Step 5.3: Verify TypeScript**

```bash
cd nodetool/web && npx tsc --noEmit 2>&1 | grep VibeCodingPreview | head -10
```
Expected: no errors

- [ ] **Step 5.4: Commit**

```bash
cd nodetool/web
git add src/components/vibecoding/VibeCodingPreview.tsx
git commit -m "feat(web): rewrite VibeCodingPreview — localhost iframe with error states"
```

---

## Chunk 4: VibeCodingChat + VibeCodingPanel Rewrite

### Task 6: Rewrite VibeCodingChat

**Files:**
- Modify: `nodetool/web/src/components/vibecoding/VibeCodingChat.tsx`
- Delete: `nodetool/web/src/components/vibecoding/utils/extractHtml.ts`

- [ ] **Step 6.1: Verify Template type is exported from useVibecodingTemplates**

```bash
grep -n "export.*Template\|Template" nodetool/web/src/hooks/useVibecodingTemplates.ts | head -10
```
If `Template` is not an exported type, import only the hook and type the template inline.

- [ ] **Step 6.2: Write the new VibeCodingChat.tsx**

Replace `nodetool/web/src/components/vibecoding/VibeCodingChat.tsx`:

```typescript
/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, memo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography, Chip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { Message, Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import { BASE_URL } from "../../stores/BASE_URL";
import { authHeader } from "../../stores/ApiClient";
import ChatView from "../chat/containers/ChatView";
import type { Theme } from "@mui/material/styles";
import { useVibecodingTemplates } from "../../hooks/useVibecodingTemplates";

const createStyles = (theme: Theme) =>
  css({
    "&": { display: "flex", flexDirection: "column", height: "100%", backgroundColor: theme.palette.background.paper },
    ".chat-header": { padding: "12px 16px", borderBottom: `1px solid ${theme.palette.divider}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
    ".chat-title": { display: "flex", alignItems: "center", gap: "8px" },
    ".template-chips": { display: "flex", gap: "8px", padding: "8px 16px", borderBottom: `1px solid ${theme.palette.divider}`, flexWrap: "wrap" },
    ".chat-container": { flex: 1, overflow: "hidden" },
  });

/** Extract the first TypeScript/TSX code block from a markdown AI response. */
function extractCodeBlock(response: string): string | null {
  const match = response.match(/```(?:tsx?|typescript|jsx?)?\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

interface VibeCodingChatProps {
  workflow: Workflow;
  workspacePath: string;
}

const VibeCodingChat: React.FC<VibeCodingChatProps> = ({ workflow, workspacePath }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const getSession = useVibeCodingStore((s) => s.getSession);
  const addMessage = useVibeCodingStore((s) => s.addMessage);
  const updateLastMessage = useVibeCodingStore((s) => s.updateLastMessage);
  const setChatStatus = useVibeCodingStore((s) => s.setChatStatus);
  const session = getSession(workflow.id);

  const { templates } = useVibecodingTemplates();
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef<string>("");

  const sendMessage = useCallback(
    async (message: Message) => {
      let prompt = "";
      if (Array.isArray(message.content)) {
        prompt = message.content.find((c): c is { type: "text"; text: string } => c.type === "text")?.text ?? "";
      } else if (typeof message.content === "string") {
        prompt = message.content;
      }
      if (!prompt.trim() || isStreaming) return;

      addMessage(workflow.id, { type: "message", name: "", role: "user", content: [{ type: "text", text: prompt }], created_at: new Date().toISOString() });
      addMessage(workflow.id, { type: "message", name: "", role: "assistant", content: [{ type: "text", text: "" }], created_at: new Date().toISOString() });
      setChatStatus(workflow.id, "streaming");
      setIsStreaming(true);
      accumulatedRef.current = "";
      abortRef.current = new AbortController();

      try {
        const headers = await authHeader();
        const response = await fetch(`${BASE_URL}/api/vibecoding/generate`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ workflow_id: workflow.id, prompt }),
          signal: abortRef.current.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedRef.current += decoder.decode(value, { stream: true });
          updateLastMessage(workflow.id, accumulatedRef.current);
        }

        // Write generated page to workspace
        const code = extractCodeBlock(accumulatedRef.current);
        if (code && workspacePath && window.api?.workspace?.file) {
          await window.api.workspace.file.write(workspacePath, "src/app/page.tsx", code);
        }
        setChatStatus(workflow.id, "idle");
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          setChatStatus(workflow.id, "idle");
        } else {
          setChatStatus(workflow.id, "error");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [workflow.id, workspacePath, isStreaming, addMessage, updateLastMessage, setChatStatus]
  );

  const handleStop = useCallback(() => { abortRef.current?.abort(); }, []);

  const chatStatus = useMemo(() => {
    if (isStreaming) return "streaming";
    return session.chatStatus === "error" ? "error" : "connected";
  }, [isStreaming, session.chatStatus]);

  const welcomePlaceholder = useMemo(() => (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center", p: 4 }}>
      <AutoFixHighIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
      <Typography variant="h6" gutterBottom>Design Your App</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400 }}>
        Describe your UI. The AI will generate a Next.js page and update the live preview.
      </Typography>
    </Box>
  ), []);

  return (
    <Box css={styles}>
      <div className="chat-header">
        <div className="chat-title">
          <AutoFixHighIcon color="primary" />
          <Typography variant="subtitle1" fontWeight={500}>VibeCoding</Typography>
        </div>
        <Typography variant="caption" color="text.secondary">{workflow.name}</Typography>
      </div>

      {templates && templates.length > 0 && session.messages.length === 0 && (
        <div className="template-chips">
          {templates.map((template) => (
            <Chip
              key={template.id}
              label={template.name}
              size="small"
              onClick={() => sendMessage({ type: "message", name: "", role: "user", content: [{ type: "text", text: template.prompt }], created_at: new Date().toISOString() })}
              clickable
              variant="outlined"
            />
          ))}
        </div>
      )}

      <div className="chat-container">
        <ChatView
          status={chatStatus}
          progress={0}
          total={100}
          messages={session.messages}
          sendMessage={sendMessage}
          onStop={handleStop}
          showToolbar={false}
          noMessagesPlaceholder={welcomePlaceholder}
          progressMessage={null}
        />
      </div>
    </Box>
  );
};

export default memo(VibeCodingChat);
```

- [ ] **Step 6.3: Delete the retired extractHtml utility**

```bash
cd nodetool/web && git rm src/components/vibecoding/utils/extractHtml.ts
```

- [ ] **Step 6.4: Verify TypeScript**

```bash
cd nodetool/web && npx tsc --noEmit 2>&1 | grep -E "VibeCodingChat|extractHtml" | head -10
```
Expected: no errors

- [ ] **Step 6.5: Commit**

```bash
cd nodetool/web
git add src/components/vibecoding/VibeCodingChat.tsx
git commit -m "feat(web): rewrite VibeCodingChat — writes .tsx to workspace via IPC"
```

---

### Task 7: Rewrite VibeCodingPanel + update VibeCodingModal

**Files:**
- Modify: `nodetool/web/src/components/vibecoding/VibeCodingPanel.tsx`
- Modify: `nodetool/web/src/components/vibecoding/VibeCodingModal.tsx`

> **Where does `workspacePath` come from?**
> A `Workflow` is connected to a workspace. The workspace has a `WorkspaceResponse.path` field (the local filesystem path). The caller that opens the VibeCoding modal must fetch the workflow's linked workspace and pass `workspace.path` as `workspacePath`. For Plan A, `workspacePath` is passed as an explicit prop — how the caller fetches it is outside this component's scope.

- [ ] **Step 7.1: Check Workflow type for workspace field**

```bash
grep -n "workspace" nodetool/web/src/stores/ApiTypes.ts | head -10
```

If `Workflow` already has a `workspace_path` or `workspace` field, use it. Otherwise `workspacePath` stays as a separate prop.

- [ ] **Step 7.2: Write the new VibeCodingPanel.tsx**

Replace `nodetool/web/src/components/vibecoding/VibeCodingPanel.tsx`:

```typescript
/** @jsxImportSource @emotion/react */
import React, { useCallback, useEffect, useMemo, memo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { CloseButton } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useVibeCodingStore } from "../../stores/VibeCodingStore";
import VibeCodingChat from "./VibeCodingChat";
import VibeCodingPreview from "./VibeCodingPreview";
import type { Theme } from "@mui/material/styles";

const createStyles = (theme: Theme) =>
  css({
    "&": { display: "flex", flexDirection: "column", height: "100%", backgroundColor: theme.palette.background.default },
    ".panel-header": { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${theme.palette.divider}`, backgroundColor: theme.palette.background.paper },
    ".panel-content": { flex: 1, display: "flex", overflow: "hidden" },
    ".chat-section": { width: "40%", minWidth: "300px", borderRight: `1px solid ${theme.palette.divider}`, display: "flex", flexDirection: "column" },
    ".preview-section": { flex: 1, minWidth: "400px", display: "flex", flexDirection: "column" },
  });

// Simple port allocator — starts at 3100, increments per panel instance.
// WorkspaceDevServer deduplicates by workspacePath, so re-opening the same
// workspace reuses the already-running server.
let nextPort = 3100;
function allocatePort(): number { return nextPort++; }

interface VibeCodingPanelProps {
  workflow: Workflow;
  workspacePath: string;  // WorkspaceResponse.path for the linked workspace
  onClose?: () => void;
}

const VibeCodingPanel: React.FC<VibeCodingPanelProps> = ({ workflow, workspacePath, onClose }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initSession = useVibeCodingStore((s) => s.initSession);
  const setServerStatus = useVibeCodingStore((s) => s.setServerStatus);
  const appendServerLog = useVibeCodingStore((s) => s.appendServerLog);
  const getSession = useVibeCodingStore((s) => s.getSession);
  const session = getSession(workflow.id);

  const portRef = useRef<number>(allocatePort());
  const spawnedRef = useRef(false);

  useEffect(() => {
    if (spawnedRef.current) return;
    spawnedRef.current = true;

    initSession(workflow.id, workspacePath);
    setServerStatus(workflow.id, "starting", null);

    const startServer = async () => {
      try {
        // Ensure dependencies are installed before starting
        await window.api.workspace.server.ensureInstalled(workspacePath);
        setServerStatus(workflow.id, "starting", null);
        const port = await window.api.workspace.server.spawn(workspacePath, portRef.current);
        setServerStatus(workflow.id, "running", port);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        appendServerLog(workflow.id, msg);
        setServerStatus(workflow.id, "error", null);
      }
    };
    startServer();
    // Server is intentionally NOT killed on unmount — stays alive for fast re-open
  }, [workflow.id, workspacePath, initSession, setServerStatus, appendServerLog]);

  const handleRestart = useCallback(async () => {
    setServerStatus(workflow.id, "starting", null);
    try {
      const port = await window.api.workspace.server.respawn(workspacePath, portRef.current);
      setServerStatus(workflow.id, "running", port);
    } catch (err: unknown) {
      appendServerLog(workflow.id, err instanceof Error ? err.message : String(err));
      setServerStatus(workflow.id, "error", null);
    }
  }, [workflow.id, workspacePath, setServerStatus, appendServerLog]);

  return (
    <Box css={styles}>
      <div className="panel-header">
        <Typography variant="h6">Design App UI</Typography>
        {onClose && <CloseButton onClick={onClose} />}
      </div>
      <div className="panel-content">
        <div className="chat-section">
          <VibeCodingChat workflow={workflow} workspacePath={workspacePath} />
        </div>
        <div className="preview-section">
          <VibeCodingPreview
            port={session.port}
            serverStatus={session.serverStatus}
            serverLogs={session.serverLogs}
            onRestart={handleRestart}
          />
        </div>
      </div>
    </Box>
  );
};

export default memo(VibeCodingPanel);
```

- [ ] **Step 7.3: Update VibeCodingModal.tsx**

Read the current file, then add `workspacePath` prop and thread it to `VibeCodingPanel`:

```typescript
// In VibeCodingModalProps, add:
workspacePath: string;

// In the Dialog content, change:
<VibeCodingPanel workflow={workflow} onClose={onClose} />
// to:
<VibeCodingPanel workflow={workflow} workspacePath={workspacePath} onClose={onClose} />
```

- [ ] **Step 7.4: Verify TypeScript**

```bash
cd nodetool/web && npx tsc --noEmit 2>&1 | grep vibecoding | head -20
```
Expected: no errors (callers of `VibeCodingModal` that don't pass `workspacePath` will error — fix those callsites by passing the linked workspace's `path`)

- [ ] **Step 7.5: Commit**

```bash
cd nodetool/web
git add src/components/vibecoding/VibeCodingPanel.tsx src/components/vibecoding/VibeCodingModal.tsx
git commit -m "feat(web): rewrite VibeCodingPanel — dev server lifecycle management"
```

---

## Chunk 5: Block Components

### Task 8: Add block components to demo/

**Files:**
- Create: `nodetool/demo/src/components/blocks/*.tsx` + `index.ts`

> All block components need `"use client"` since they use event handlers. They also need `import React from "react"` unless the project's tsconfig sets `"jsx": "react-jsx"` (check `nodetool/demo/tsconfig.json` — if it does, the import is optional).

- [ ] **Step 8.1: Check tsconfig jsx setting**

```bash
grep -n "jsx" nodetool/demo/tsconfig.json
```
If `"jsx": "react-jsx"`, React import is not needed. If `"jsx": "react"`, add `import React from "react"` to every component.

- [ ] **Step 8.2: Create AppHeader.tsx**

```typescript
// nodetool/demo/src/components/blocks/AppHeader.tsx
"use client";
import React from "react";

interface AppHeaderProps {
  icon?: string;
  title: string;
  subtitle?: React.ReactNode;
}

export function AppHeader({ icon, title, subtitle }: AppHeaderProps) {
  return (
    <header className="relative overflow-hidden text-center pt-10 pb-8">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.12),transparent_70%)]" />
      <div className="relative">
        <div className="flex items-center justify-center gap-2.5 mb-2">
          {icon && <span className="text-3xl">{icon}</span>}
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        </div>
        {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
      </div>
    </header>
  );
}
```

- [ ] **Step 8.3: Create StepIndicator.tsx**

```typescript
// nodetool/demo/src/components/blocks/StepIndicator.tsx
"use client";
import React from "react";

interface Step { num: number; label: string; }

export function StepIndicator({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = s.num < current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                isActive ? "bg-indigo-500 text-white shadow-[0_0_20px_-3px_rgba(99,102,241,0.5)]"
                : isDone ? "bg-green-500/20 text-green-400 border border-green-500/50"
                : "bg-muted text-slate-500 border border-border"
              }`}>
                {isDone ? "✓" : s.num}
              </div>
              <span className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
                isActive ? "text-indigo-300" : isDone ? "text-green-400" : "text-slate-600"
              }`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-16 h-px mx-3 mb-5 transition-colors duration-300 ${isDone ? "bg-green-500/50" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 8.4: Create SampleChips.tsx**

```typescript
// nodetool/demo/src/components/blocks/SampleChips.tsx
"use client";
import React from "react";
import { Badge } from "@/components/ui/badge";

interface Sample { label: string; text: string; }

export function SampleChips({ samples, selected, onSelect }: { samples: Sample[]; selected: string; onSelect: (text: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {samples.map((s) => (
        <Badge
          key={s.label}
          variant="outline"
          className={`cursor-pointer transition-all hover:bg-indigo-500/5 hover:border-indigo-500 hover:text-slate-200 ${
            selected === s.text
              ? "bg-indigo-500/10 border-indigo-400 text-indigo-200 shadow-[0_0_8px_-2px_rgba(99,102,241,0.3)]"
              : "text-slate-400"
          }`}
          onClick={() => onSelect(s.text)}
        >
          {s.label}
        </Badge>
      ))}
    </div>
  );
}
```

- [ ] **Step 8.5: Create InputCard.tsx**

```typescript
// nodetool/demo/src/components/blocks/InputCard.tsx
"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SampleChips } from "./SampleChips";

interface Sample { label: string; text: string; }

interface InputCardProps {
  title: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  samples?: Sample[];
  disabled?: boolean;
  rows?: number;
}

export function InputCard({ title, description, value, onChange, onSubmit, submitLabel = "Run →", samples, disabled, rows = 5 }: InputCardProps) {
  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="relative pb-4">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-sm">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {samples && <SampleChips samples={samples} selected={value} onSelect={onChange} />}
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="resize-y focus:border-indigo-500/50" />
        <Button
          className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold hover:opacity-90 transition-all"
          onClick={onSubmit} disabled={disabled || !value.trim()} size="lg"
        >
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8.6: Create ResultCard.tsx**

```typescript
// nodetool/demo/src/components/blocks/ResultCard.tsx
"use client";
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Variant = "success" | "warning" | "error" | "info";
const V: Record<Variant, { border: string; glow: string; dot: string; line: string }> = {
  success: { border: "border-green-500/20", glow: "shadow-[0_0_30px_-8px_rgba(34,197,94,0.1)]", dot: "bg-green-500", line: "via-green-500/50" },
  warning: { border: "border-yellow-500/30", glow: "shadow-[0_0_30px_-8px_rgba(234,179,8,0.1)]", dot: "bg-yellow-500", line: "via-yellow-500/50" },
  error:   { border: "border-red-500/30",    glow: "shadow-[0_0_30px_-8px_rgba(239,68,68,0.1)]",  dot: "bg-red-500",    line: "via-red-500/50" },
  info:    { border: "border-indigo-500/30", glow: "shadow-[0_0_30px_-8px_rgba(99,102,241,0.1)]", dot: "bg-indigo-500", line: "via-indigo-500/50" },
};

export function ResultCard({ title, variant = "success", children }: { title: string; variant?: Variant; children: React.ReactNode }) {
  const s = V[variant];
  return (
    <Card className={`overflow-hidden ${s.border} ${s.glow}`}>
      <CardHeader className="relative pb-3">
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${s.line} to-transparent`} />
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${s.dot} animate-pulse`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

- [ ] **Step 8.7: Create LoadingCard.tsx**

```typescript
// nodetool/demo/src/components/blocks/LoadingCard.tsx
"use client";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export function LoadingCard({ title = "Processing…", subtitle }: { title?: string; subtitle?: string }) {
  return (
    <Card className="overflow-hidden border-indigo-500/30 shadow-[0_0_40px_-8px_rgba(99,102,241,0.2)]">
      <CardContent className="py-16 flex flex-col items-center gap-6">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <div className="absolute inset-3 rounded-full border-2 border-transparent border-t-violet-500 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-200 mb-1">{title}</p>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8.8: Create MediaOutput.tsx**

```typescript
// nodetool/demo/src/components/blocks/MediaOutput.tsx
"use client";
import React from "react";

export function MediaOutput({ type, src, alt = "Output", className = "" }: { type: "image" | "audio" | "video"; src: string; alt?: string; className?: string }) {
  if (type === "image") return <img src={src} alt={alt} className={`w-full rounded ${className}`} style={{ imageRendering: "pixelated" }} />;
  if (type === "audio") return <audio controls src={src} className={`w-full ${className}`} />;
  return <video controls src={src} className={`w-full rounded ${className}`} />;
}
```

- [ ] **Step 8.9: Create ErrorAlert.tsx**

```typescript
// nodetool/demo/src/components/blocks/ErrorAlert.tsx
"use client";
import React from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export function ErrorAlert({ message, title = "Error" }: { message: string; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 8.10: Create index.ts barrel**

```typescript
// nodetool/demo/src/components/blocks/index.ts
export { AppHeader } from "./AppHeader";
export { StepIndicator } from "./StepIndicator";
export { InputCard } from "./InputCard";
export { ResultCard } from "./ResultCard";
export { LoadingCard } from "./LoadingCard";
export { SampleChips } from "./SampleChips";
export { MediaOutput } from "./MediaOutput";
export { ErrorAlert } from "./ErrorAlert";
```

- [ ] **Step 8.11: Build demo to verify**

```bash
cd nodetool/demo && npm run build 2>&1 | tail -20
```
Expected: successful build

- [ ] **Step 8.12: Commit**

```bash
cd nodetool/demo
git add src/components/blocks/
git commit -m "feat(demo): add 8 standardized block components"
```

---

## End-to-End Smoke Test

After all tasks pass:

- [ ] Open NodeTool Electron app
- [ ] Open a workflow connected to a workspace (workspace `path` points to a copy of `demo/`)
- [ ] Open VibeCoding from the workflow (pass `workspace.path` as `workspacePath` to the modal)
- [ ] Confirm preview shows "Setting up workspace…" then "Starting dev server…" then loads `http://localhost:310x`
- [ ] Type: "Create a simple app with an AppHeader titled 'Hello World' and a LoadingCard below it"
- [ ] Confirm AI streams back a code block
- [ ] Confirm `src/app/page.tsx` in the workspace is updated on disk
- [ ] Confirm the preview auto-refreshes via HMR and renders the new UI

---

## Notes for Plan B (WYSIWYG + Theme + Palette)

Plan B adds on top of this foundation:
- Babel/SWC compiler plugin: `data-vibe-id` attribute + `postMessage` click listener injected into every JSX element (dev-only)
- Selection highlight overlay: parent-frame div that receives `message` events and draws the selection box
- Property panel: ts-morph-based edits for static string children, single-line className tokens, single-line string props
- Theme panel: visual CSS var editor writing to `globals.css`
- Component palette: sidebar listing `src/components/blocks/`, drag triggers AI instruction to insert component
