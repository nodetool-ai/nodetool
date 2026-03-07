---
layout: page
title: "LTX-Desktop Integration Feasibility (Fork Strategy)"
---

## Goal

Evaluate whether **LTX-Desktop** can be integrated into NodeTool as a fork, with a user flow where NodeTool assets (images/audio/video) can be dropped onto a timeline editor.

## Short answer

Yes, this is feasible, but there are two very different paths:

1. **Loose fork / sidecar integration (recommended for v1):** Keep LTX timeline/editor code mostly isolated, launch it from NodeTool, and sync media via file paths + manifest.
2. **Deep in-tree fork (higher risk):** Merge LTX frontend/editor state directly into NodeTool web/electron codebase.

The sidecar approach gets value fastest with much lower maintenance risk.

---

## What exists in NodeTool today (relevant facts)

### Asset model and APIs are already strong

- Asset type definitions are centralized in  
  `/home/runner/work/nodetool/nodetool/web/src/stores/ApiTypes.ts`.
- Asset CRUD/upload/search flows are implemented in  
  `/home/runner/work/nodetool/nodetool/web/src/stores/AssetStore.ts`.
- Concurrent upload queue (`maxConcurrentUploads: 3`) exists in  
  `/home/runner/work/nodetool/nodetool/web/src/serverState/useAssetUpload.ts`.

### Drag/drop of NodeTool assets is already implemented

- External file drag/drop surface exists in  
  `/home/runner/work/nodetool/nodetool/web/src/components/assets/Dropzone.tsx`.
- Internal asset drag serialization exists in  
  `/home/runner/work/nodetool/nodetool/web/src/components/assets/useAssetActions.ts`.
- Generic file-drop handling and optional upload pipeline exists in  
  `/home/runner/work/nodetool/nodetool/web/src/hooks/handlers/useFileDrop.ts`.

### Electron integration points are ready for extension

- Main-process IPC registration and typed handlers are in  
  `/home/runner/work/nodetool/nodetool/electron/src/ipc.ts`.
- Renderer API typing is in  
  `/home/runner/work/nodetool/nodetool/electron/src/types.d.ts`.
- Window creation patterns are in  
  `/home/runner/work/nodetool/nodetool/electron/src/window.ts`.

### Important gap

NodeTool does **not** currently have a native NLE-style timeline editor in web/electron UI, so integration means adding a new editor surface rather than adapting existing timeline code.

---

## What exists in LTX-Desktop (relevant facts)

Source references:

- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/README.md
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/package.json
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/frontend/types/project.ts
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/frontend/views/VideoEditor.tsx
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/frontend/contexts/ProjectContext.tsx
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/electron/preload.ts
- https://raw.githubusercontent.com/Lightricks/LTX-Desktop/main/electron/ipc/file-handlers.ts

### LTX has a mature timeline/editor model

- Timeline and clip types are explicit (`Timeline`, `Track`, `TimelineClip`, transitions, effects) in `frontend/types/project.ts`.
- Editor logic and timeline interaction hooks exist (`VideoEditor.tsx`, `useTimelineDrag.ts`, `useClipOperations.ts`).

### LTX project persistence is local-first and app-specific

- `ProjectContext.tsx` persists project state to localStorage (`STORAGE_KEY = 'ltx-projects'`).
- Assets are represented as local `file://` URLs and local paths.

### LTX has its own Electron + Python backend runtime

- LTX architecture is React renderer + Electron + local FastAPI backend (`README.md`, `backend/architecture.md`).
- `package.json` indicates a separate build stack (pnpm workspace, Electron 31, Vite 5, Python 3.12 backend tooling).

### Upstream stability signal

LTX README + contributing docs explicitly say frontend architecture is under active refactor and large UI changes may be declined, which increases fork maintenance cost.

---

## Main roadblocks for a fork into NodeTool

1. **Architecture mismatch**
   - NodeTool: AGPL project with existing web/electron/backend stack.
   - LTX: separate Electron app and separate local FastAPI backend.
   - Deep merge would duplicate/overlap runtime responsibilities (Electron main process, backend lifecycle, settings, update flow).

2. **Data model mismatch**
   - NodeTool assets are server-backed resources with IDs and metadata.
   - LTX timeline expects local project-scoped assets with local paths/URLs.
   - Requires explicit adapter layer (NodeTool Asset ↔ LTX Asset).

3. **State ownership mismatch**
   - LTX editor state is tightly bound to its own `ProjectContext` and localStorage schema.
   - NodeTool should not rely on app-local storage as source of truth for shared assets/workflows.

4. **Backend/runtime duplication**
   - LTX includes generation flows tied to its own backend assumptions.
   - For timeline-only use in NodeTool, a large subset of generation-specific code should be disabled or isolated.

5. **Packaging and distribution complexity**
   - Bundling two Electron-oriented app designs into one distribution increases installer complexity and artifact size.

6. **Platform support mismatch**
   - LTX README states Linux is not officially supported; NodeTool supports Linux.
   - Fork must preserve NodeTool platform promises even if timeline feature is partially degraded.

7. **License/compliance work**
   - NodeTool is AGPLv3, LTX is Apache-2.0.
   - Compatibility is workable, but NOTICE/attribution obligations must be carried through in the forked component distribution.

---

## Recommended implementation strategy

### Phase 1 (MVP): Sidecar fork integration inside NodeTool Electron

Target: let users select NodeTool assets and open a timeline editor where clips are pre-populated.

### Core design

1. Add a NodeTool action (from assets UI) to "Open in Timeline Editor".
2. NodeTool writes a **timeline session manifest** (JSON) containing selected NodeTool assets:
   - `asset_id`
   - normalized file path or downloadable URL
   - media type
   - duration / metadata
3. NodeTool launches forked LTX editor process/window in timeline-only mode.
4. Forked editor reads manifest, maps to LTX `Asset` model, and opens timeline with initial clips.
5. Exported outputs are imported back into NodeTool assets via existing upload APIs.

### NodeTool touchpoints

- UI action entry:  
  `/home/runner/work/nodetool/nodetool/web/src/components/assets/AssetActionsMenu.tsx`
- IPC channel additions:  
  `/home/runner/work/nodetool/nodetool/electron/src/ipc.ts` and  
  `/home/runner/work/nodetool/nodetool/electron/src/types.d.ts`
- Reuse existing asset upload and drag/drop logic in:
  - `/home/runner/work/nodetool/nodetool/web/src/serverState/useAssetUpload.ts`
  - `/home/runner/work/nodetool/nodetool/web/src/components/assets/useAssetActions.ts`

### Why this should be first

- Smallest invasive change.
- Clear rollback path.
- Keeps LTX fork insulated from core NodeTool workflow/editor code.

---

## Phase 2: Bidirectional sync hardening

1. Persist timeline session metadata in NodeTool (asset IDs + cut list + editor version).
2. Add robust relinking for moved/deleted assets.
3. Add import/export adapters (e.g., FCP7 XML or internal JSON) if collaborative interchange is needed.

---

## Phase 3 (optional): Deeper in-tree merge

Only attempt after Phase 1/2 proves adoption.

- Replace LTX local project store with NodeTool-backed state.
- Converge keyboard shortcuts, theming, and settings.
- Remove duplicated generation/runtime paths not needed in NodeTool.

This is high effort and higher long-term maintenance risk because upstream LTX editor internals are still evolving.

---

## Feasibility verdict

**Feasible: yes.**  
**Recommended path:** fork LTX timeline/editor as an isolated component first (sidecar mode), then progressively integrate.

This provides timeline editing on top of NodeTool assets without destabilizing the core NodeTool architecture.
