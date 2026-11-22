/**
 * The Pattern Browser (SQ43): search, then Patterns and Templates, each with
 * Factory and User folders. Choosing an entry loads it into the open region
 * through `apply_step_pattern` (one undo step). Save Pattern and Save Template
 * go through `save_step_pattern`. Dragging an entry to the tracks area sets a
 * `application/x-nodetool-step-pattern-id` payload.
 *
 * User patterns sit in a folder tree (p. 783): New Folder, Rename Folder and
 * Delete Folder edit it, and Delete moves the folder's patterns to its parent.
 * Dropping a user pattern on a folder, or on the User list, moves it there.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MoreHorizIcon from "@mui/icons-material/MoreHorizOutlined";
import FolderIcon from "@mui/icons-material/FolderOutlined";

import type { TimelineOp, TimelineOpResult } from "@nodetool-ai/timeline/ops";

import {
  Caption,
  CollapsibleSection,
  ContextMenu,
  FlexColumn,
  FlexRow,
  ICON_SIZE,
  InlineEditableText,
  MenuItemPrimitive,
  ScrollArea,
  SearchInput,
  SelectableListItem,
  SPACING,
  ToolbarIconButton,
  TreeRow
} from "../../ui_primitives";

export const STEP_PATTERN_DRAG_TYPE = "application/x-nodetool-step-pattern-id";

interface Entry {
  id: string;
  name: string;
  kind: "pattern" | "template";
  category: string;
  source: "factory" | "user";
  folder?: string;
}

type Kind = "pattern" | "template";

interface Folder {
  id?: string;
  name: string;
  kind: Kind;
  folder: string;
  parentFolder: string;
}

const ROOT_FOLDER: Record<Kind, string> = { pattern: "Step Patterns/Patterns", template: "Step Patterns/Templates" };

/** "New Folder", or "New Folder 2" and up when the name is taken in `parent`. */
function uniqueFolderName(base: string, parent: string, folders: readonly Folder[]): string {
  const taken = new Set(folders.filter((f) => f.parentFolder === parent).map((f) => f.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

interface Props {
  clipId: string;
  patternName: string;
  run: (ops: TimelineOp[]) => Promise<TimelineOpResult[]>;
  onError: (message: string) => void;
  /** Bumped by the editor after a save from a key or menu, so the list reloads. */
  libraryRevision?: number;
}

export const StepPatternBrowser: React.FC<Props> = memo(({ clipId, patternName, run, onError, libraryRevision = 0 }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [useProjectKey, setUseProjectKey] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const fail = useCallback((err: unknown) => onError(err instanceof Error ? err.message : String(err)), [onError]);
  const reload = useCallback(() => setRevision((r) => r + 1), []);

  useEffect(() => {
    let alive = true;
    run([{ op: "list_step_patterns", ...(submitted ? { query: submitted } : {}) }])
      .then(([result]) => {
        if (!alive) return;
        const listed = result as { entries?: Entry[]; folders?: Folder[] };
        setEntries(listed.entries ?? []);
        setFolders(listed.folders ?? []);
      })
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [run, submitted, revision, libraryRevision, fail]);

  const load = useCallback(
    (entry: Entry) => {
      run([{ op: "apply_step_pattern", clipId, pattern: entry.id, ...(useProjectKey ? { useProjectKey: true } : {}) }]).catch(fail);
    },
    [run, clipId, useProjectKey, fail]
  );

  const save = useCallback(
    (kind: Kind) => {
      run([{ op: "save_step_pattern", clipId, name: patternName || t("stepSequencer.browser.untitled"), kind }])
        .then(reload)
        .catch(fail);
    },
    [run, clipId, patternName, t, reload, fail]
  );

  const folderOf = useCallback((path: string | null) => folders.find((f) => f.folder === path) ?? null, [folders]);

  /** New Folder inside `parent` (a folder, or the Patterns root), then edit its name. */
  const newFolder = useCallback(
    (parent: Folder | null) => {
      const kind = parent?.kind ?? "pattern";
      const parentPath = parent?.folder ?? ROOT_FOLDER[kind];
      const name = uniqueFolderName(t("stepSequencer.browser.newFolder"), parentPath, folders);
      run([{ op: "create_step_pattern_folder", name, kind, ...(parent ? { parentFolder: parent.folder } : {}) }])
        .then(([result]) => {
          const created = (result as { folder?: string }).folder;
          if (created) {
            setSelectedFolder(created);
            setRenaming(created);
          }
          reload();
        })
        .catch(fail);
    },
    [run, folders, t, reload, fail]
  );

  const renameFolder = useCallback(
    (folder: Folder, newName: string) => {
      setRenaming(null);
      run([{ op: "rename_step_pattern_folder", folder: folder.folder, newName, kind: folder.kind }])
        .then(([result]) => {
          const renamed = (result as { folder?: string }).folder;
          if (renamed && selectedFolder === folder.folder) setSelectedFolder(renamed);
          reload();
        })
        .catch((err: unknown) => {
          // The library rolls back a failed rename; reload shows what it holds (F63).
          fail(err);
          reload();
        });
    },
    [run, selectedFolder, reload, fail]
  );

  const deleteFolder = useCallback(
    (folder: Folder) => {
      run([{ op: "delete_step_pattern_folder", folder: folder.folder, kind: folder.kind }])
        .then(() => {
          setSelectedFolder((sel) => (sel !== null && (sel === folder.folder || sel.startsWith(`${folder.folder}/`)) ? null : sel));
          reload();
        })
        .catch(fail);
    },
    [run, reload, fail]
  );

  const userEntry = useCallback((id: string) => entries.find((e) => e.source === "user" && e.id === id), [entries]);

  /** Drop target props for a folder path: a user pattern of the same kind moves there. */
  const dropProps = (path: string, kind: Kind) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (!Array.from(ev.dataTransfer.types ?? []).includes(STEP_PATTERN_DRAG_TYPE)) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "move";
      if (dropTarget !== path) setDropTarget(path);
    },
    onDragLeave: (ev: React.DragEvent) => {
      if (ev.currentTarget.contains(ev.relatedTarget as Node | null)) return;
      setDropTarget((d) => (d === path ? null : d));
    },
    onDrop: (ev: React.DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      setDropTarget(null);
      const entry = userEntry(ev.dataTransfer.getData(STEP_PATTERN_DRAG_TYPE));
      if (!entry || entry.kind !== kind || (entry.folder ?? ROOT_FOLDER[kind]) === path) return;
      run([{ op: "move_step_pattern", pattern: entry.id, folder: path }]).then(reload).catch(fail);
    }
  });

  const groups = useMemo(() => {
    const out: Record<Kind, Record<"factory" | "user", Entry[]>> = {
      pattern: { factory: [], user: [] },
      template: { factory: [], user: [] }
    };
    for (const e of entries) out[e.kind][e.source].push(e);
    return out;
  }, [entries]);

  const entryRow = (e: Entry, depth = 0) => (
    <SelectableListItem
      key={`${e.source}:${e.id}`}
      draggable
      onDragStart={(ev: React.DragEvent) => {
        ev.dataTransfer.setData(STEP_PATTERN_DRAG_TYPE, e.id);
        ev.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={() => load(e)}
      data-testid={`browser-entry-${e.id}`}
      sx={depth > 0 ? { pl: SPACING.md * (depth + 1) } : undefined}
    >
      <FlexRow justify="space-between" fullWidth gap={SPACING.xs}>
        <Caption component="span">{e.name}</Caption>
        <Caption component="span" color="muted">
          {e.category}
        </Caption>
      </FlexRow>
    </SelectableListItem>
  );

  const empty = (
    <Caption color="muted" sx={{ px: SPACING.md, py: SPACING.xs }}>
      {t("stepSequencer.browser.empty")}
    </Caption>
  );

  /** One folder level: subfolders first, then the patterns in it. */
  const folderLevel = (kind: Kind, path: string, depth: number): React.ReactNode[] => {
    const subfolders = folders.filter((f) => f.kind === kind && f.parentFolder === path).sort((a, b) => a.name.localeCompare(b.name));
    const here = groups[kind].user.filter((e) => (e.folder ?? ROOT_FOLDER[kind]) === path);
    return [
      ...subfolders.map((f) => (
        <FlexColumn key={f.folder} {...dropProps(f.folder, kind)}>
          <TreeRow
            depth={depth}
            interactive
            selected={selectedFolder === f.folder || dropTarget === f.folder}
            role="treeitem"
            tabIndex={0}
            data-testid={`browser-folder-${f.folder}`}
            onClick={() => setSelectedFolder(f.folder)}
            onDoubleClick={() => setRenaming(f.folder)}
            onKeyDown={(ev: React.KeyboardEvent) => {
              if (ev.key === "Enter" && renaming !== f.folder) setRenaming(f.folder);
            }}
            onContextMenu={(ev: React.MouseEvent) => {
              ev.preventDefault();
              setSelectedFolder(f.folder);
              setFolderMenu({ folder: f, x: ev.clientX, y: ev.clientY });
            }}
          >
            <FolderIcon sx={{ fontSize: ICON_SIZE.sm, flexShrink: 0 }} />
            <InlineEditableText
              value={f.name}
              editing={renaming === f.folder}
              onEditingChange={(editing) => setRenaming(editing ? f.folder : null)}
              onCommit={(next) => renameFolder(f, next)}
              onCancel={() => setRenaming(null)}
              selectOnFocus
              ariaLabel={t("stepSequencer.browser.folderName")}
            />
          </TreeRow>
          <FlexColumn data-testid={`browser-folder-children-${f.folder}`}>{folderLevel(kind, f.folder, depth + 1)}</FlexColumn>
        </FlexColumn>
      )),
      ...here.map((e) => entryRow(e, depth))
    ];
  };

  const userList = (kind: Kind) => {
    const items = folderLevel(kind, ROOT_FOLDER[kind], 0);
    return (
      <FlexColumn
        data-testid={`browser-user-${kind}`}
        sx={{ minHeight: SPACING.xl * 4, bgcolor: dropTarget === ROOT_FOLDER[kind] ? "action.hover" : undefined }}
        {...dropProps(ROOT_FOLDER[kind], kind)}
      >
        {items.length === 0 ? empty : items}
      </FlexColumn>
    );
  };

  const selected = folderOf(selectedFolder);

  return (
    <FlexColumn data-testid="step-pattern-browser" sx={{ width: 240, flexShrink: 0, minHeight: 0, borderRight: 1, borderColor: "divider" }}>
      <FlexRow gap={SPACING.xs} align="center" sx={{ p: SPACING.sm }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={setSubmitted}
          onClear={() => setSubmitted("")}
          placeholder={t("stepSequencer.browser.search")}
          ariaLabel={t("stepSequencer.browser.search")}
          size="small"
          fullWidth
        />
        <ToolbarIconButton tooltip={t("stepSequencer.browser.actions")} aria-label={t("stepSequencer.browser.actions")} onClick={(e) => setMenu(e.currentTarget)}>
          <MoreHorizIcon fontSize="small" />
        </ToolbarIconButton>
      </FlexRow>
      <ScrollArea sx={{ flex: 1, minHeight: 0 }}>
        {(["pattern", "template"] as const).map((kind) => (
          <CollapsibleSection key={kind} title={t(`stepSequencer.browser.${kind}s`)} defaultOpen>
            <CollapsibleSection title={t("stepSequencer.browser.factory")} defaultOpen>
              {groups[kind].factory.length === 0 ? empty : groups[kind].factory.map((e) => entryRow(e))}
            </CollapsibleSection>
            <CollapsibleSection title={t("stepSequencer.browser.user")} defaultOpen>
              {userList(kind)}
            </CollapsibleSection>
          </CollapsibleSection>
        ))}
      </ScrollArea>
      <ContextMenu open={menu !== null} anchorEl={menu} onClose={() => setMenu(null)}>
        <MenuItemPrimitive
          label={t("stepSequencer.browser.useProjectKey")}
          checkable="checkbox"
          checked={useProjectKey}
          onClick={() => {
            setMenu(null);
            setUseProjectKey((v) => !v);
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.cmd.savePattern")}
          dividerBefore
          onClick={() => {
            setMenu(null);
            save("pattern");
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.cmd.saveTemplate")}
          onClick={() => {
            setMenu(null);
            save("template");
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.browser.newFolder")}
          dividerBefore
          onClick={() => {
            setMenu(null);
            newFolder(selected);
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.browser.renameFolder")}
          disabled={!selected}
          onClick={() => {
            setMenu(null);
            if (selected) setRenaming(selected.folder);
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.browser.deleteFolder")}
          disabled={!selected}
          onClick={() => {
            setMenu(null);
            if (selected) deleteFolder(selected);
          }}
        />
      </ContextMenu>
      <ContextMenu
        open={folderMenu !== null}
        position={folderMenu ? { x: folderMenu.x, y: folderMenu.y } : null}
        onClose={() => setFolderMenu(null)}
      >
        <MenuItemPrimitive
          label={t("stepSequencer.browser.newFolder")}
          onClick={() => {
            const f = folderMenu?.folder ?? null;
            setFolderMenu(null);
            newFolder(f);
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.browser.renameFolder")}
          onClick={() => {
            const f = folderMenu?.folder;
            setFolderMenu(null);
            if (f) setRenaming(f.folder);
          }}
        />
        <MenuItemPrimitive
          label={t("stepSequencer.browser.deleteFolder")}
          onClick={() => {
            const f = folderMenu?.folder;
            setFolderMenu(null);
            if (f) deleteFolder(f);
          }}
        />
      </ContextMenu>
    </FlexColumn>
  );
});
StepPatternBrowser.displayName = "StepPatternBrowser";
