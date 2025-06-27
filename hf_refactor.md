# Refactoring Plan for Hugging Face Components

This document outlines the step-by-step plan to refactor the Hugging Face components in `nodetool/web/src/components/hugging_face/` for improved clarity, maintainability, and structure.

### Phase 1: Rename Dialog Components for Clarity

1.  **Rename `HuggingFaceDownloadDialog.tsx` to `DownloadManagerDialog.tsx`:**

    - **Action:** Rename the file `nodetool/web/src/components/hugging_face/HuggingFaceDownloadDialog.tsx` to `DownloadManagerDialog.tsx`.
    - **Action:** Update the component's name inside the file from `HuggingFaceDownloadDialog` to `DownloadManagerDialog`.
    - **Verification:** Search for any usages of `HuggingFaceDownloadDialog` and update the import paths and component names to match.

2.  **Rename `ModelDownloadDialog.tsx` to `RequiredModelsDialog.tsx`:**
    - **Action:** Rename the file `nodetool/web/src/components/hugging_face/ModelDownloadDialog.tsx` to `RequiredModelsDialog.tsx`.
    - **Action:** Update the component's name inside the file from `ModelDownloadDialog` to `RequiredModelsDialog`.
    - **Verification:** Perform a global search to find where this component is used (e.g., in `ModelsManager.tsx`) and update its import and usage accordingly.

### Phase 2: Deconstruct the `ModelUtils.tsx` File

3.  **Create a `useModelInfo.ts` Custom Hook:**

    - **Action:** Create a new directory `nodetool/web/src/hooks/` if it doesn't already exist.
    - **Action:** Create a new file `useModelInfo.ts` inside this directory.
    - **Action:** Cut the `useModelInfo` hook and its helper function, `computeHuggingFaceDownloadSize`, from `ModelUtils.tsx` and paste them into `useModelInfo.ts`.
    - **Verification:** Add the necessary imports to the new file and then update the import statements in the components that use this hook (`ModelCard.tsx`, `ModelListItem.tsx`) to point to the new location.

4.  **Create a `modelFormatting.ts` Utility File:**

    - **Action:** Create a new directory `nodetool/web/src/utils/` if it doesn't already exist.
    - **Action:** Create a new file `modelFormatting.ts` inside it.
    - **Action:** Move all the pure data formatting functions (`prettifyModelType`, `getShortModelName`, `formatBytes`, `groupModelsByType`, `sortModelTypes`, etc.) from `ModelUtils.tsx` to this new file.
    - **Verification:** For each function moved, search the codebase and update the import paths in every file that uses it.

5.  **Consolidate Model Action Components:**
    - **Action:** Move the stateless button components (`ModelDeleteButton`, `ModelShowInExplorerButton`, `ModelDownloadButton`, `HuggingFaceLink`, `OllamaLink`) from `ModelUtils.tsx` directly into the `ModelCardActions.tsx` file.
    - **Action:** Convert the `renderModelActions` function into a proper React component named `ModelActions` and include it in the same `ModelCardActions.tsx` file.
    - **Verification:** Refactor the `ModelCardActions` component to use these newly co-located components and update any other files that were importing them from `ModelUtils.tsx`.

### Phase 3: Final Cleanup and Verification

6.  **Clean Up `ModelUtils.tsx`:**
    - **Action:** After all the preceding steps, review the `ModelUtils.tsx` file. Its only remaining responsibility should be to export shared type definitions like `ModelComponentProps`. Remove all now-unused imports and code.
    - **Verification:** Do a final check of the application to ensure everything renders and functions as before. Specifically test:
      - Model list and grid views for correct styling and functionality.
      - Hover effects, icons, and buttons on model cards and list items.
      - Opening and closing all related dialogs.
      - Initiating a model download to ensure the progress indicators work correctly.
