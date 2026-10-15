import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

import {
  ContextMenu,
  MenuItemPrimitive,
  FlexRow,
  Caption,
  Divider,
  ListSubheader,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import { useExampleStoryboards } from "../../hooks/storyboard/useStoryboards";
import {
  TEXT_FILE_TEMPLATES,
  useNewDocumentCatalog,
  type NewDocumentSubmenu
} from "./newDocumentCatalog";
import { useGuidedFlowStarters } from "./useGuidedFlowStarters";

interface OpenMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

type MenuView = "root" | NewDocumentSubmenu;

/** The menu's width, and its room at most, in px. */
const MENU_WIDTH = 320;
const MENU_MAX_WIDTH = 340;
// Space kept between the menu and the bottom of the window.
const MENU_VIEWPORT_GAP = 16;
// The bottom status bar (PanelBottom's tab strip).
const STATUS_BAR_SELECTOR = ".panel-tabbar";

/**
 * The menu may grow down to the bottom of the window, but no further than the
 * top of the status bar, which is fixed over the window's bottom edge and hid
 * the last rows ("New skill", "New 3D model") at 1280×720. A fixed share of the
 * viewport hid most blank documents on short windows with no cue to scroll.
 */
const menuMaxHeight = (anchorEl: HTMLElement | null): string => {
  if (!anchorEl) {
    return "70vh";
  }
  const top = Math.ceil(anchorEl.getBoundingClientRect().bottom);
  const statusBar = document.querySelector(STATUS_BAR_SELECTOR);
  if (statusBar) {
    const room = Math.floor(statusBar.getBoundingClientRect().top) - top;
    return `${Math.max(room - MENU_VIEWPORT_GAP, 0)}px`;
  }
  return `calc(100vh - ${top + MENU_VIEWPORT_GAP}px)`;
};

/**
 * The `[+]` menu for the workspace tab bar. Two sections: the guided
 * creation flows (one click creates in the selected project and opens its
 * flow tab) and blank documents.
 * Starting a project lives on the project selector to the left of New.
 */
const OpenMenu = ({ anchorEl, open, onClose }: OpenMenuProps) => {
  const [view, setView] = useState<MenuView>("root");

  const close = useCallback(() => {
    setView("root");
    onClose();
  }, [onClose]);

  const {
    entries,
    createTextFile,
    createBlankStoryboard,
    installStoryboardExample,
    creating
  } = useNewDocumentCatalog({}, close);
  const { starters, starting } = useGuidedFlowStarters(close);

  const busy = creating !== null || starting !== null;

  const { data: exampleData, isLoading: examplesLoading } =
    useExampleStoryboards(open && view === "storyboards");
  const exampleStoryboards = useMemo(() => exampleData ?? [], [exampleData]);

  // Switching views swaps the rows under the focused one. Put focus back on
  // the first enabled row so arrow keys keep working.
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not(.Mui-disabled)'
    );
    first?.focus();
  }, [open, view]);

  const backRow = (
    <MenuItemPrimitive
      key="back"
      label="Back"
      icon={<ArrowBackRoundedIcon fontSize="small" />}
      onClick={() => setView("root")}
      dividerAfter
    />
  );

  return (
    <ContextMenu
      open={open}
      anchorEl={anchorEl}
      onClose={close}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      maxHeight={menuMaxHeight(anchorEl)}
      paperSx={{ width: MENU_WIDTH, maxWidth: MENU_MAX_WIDTH }}
      slotProps={{ list: { ref: listRef } }}
    >
      {view === "root" && [
        <ListSubheader key="guided-label">Guided flows</ListSubheader>,
        // The item being started says so, as the New Project cards do, so
        // the disabled menu does not read as a dead click.
        ...starters.map((starter) => (
          <MenuItemPrimitive
            key={starter.id}
            label={starter.title}
            icon={
              starting === starter.id ? (
                <LoadingSpinner size="small" />
              ) : (
                starter.icon
              )
            }
            secondary={
              starting === starter.id ? "Creating…" : starter.description
            }
            onClick={() => void starter.start()}
            disabled={busy}
          />
        )),
        <Divider key="blank-divider" />,
        <ListSubheader key="blank-label">Blank documents</ListSubheader>,
        ...entries.map((entry) => (
          <MenuItemPrimitive
            key={entry.key}
            label={entry.menuLabel}
            icon={entry.icon}
            hasSubmenu={entry.submenu !== undefined}
            onClick={() =>
              entry.submenu ? setView(entry.submenu) : void entry.create?.()
            }
            disabled={busy}
          />
        ))
      ]}

      {view === "texts" && [
        backRow,
        ...TEXT_FILE_TEMPLATES.map((template) => (
          <MenuItemPrimitive
            key={template.filename}
            label={template.label}
            onClick={() => void createTextFile(template)}
            disabled={busy}
          />
        ))
      ]}

      {view === "storyboards" && [
        backRow,
        <MenuItemPrimitive
          key="blank-storyboard"
          label="Blank storyboard"
          icon={<AddRoundedIcon fontSize="small" />}
          onClick={() => void createBlankStoryboard()}
          disabled={busy}
          dividerAfter
        />,
        examplesLoading && (
          <FlexRow key="loading" justify="center" sx={{ py: SPACING.md }}>
            <LoadingSpinner />
          </FlexRow>
        ),
        !examplesLoading && exampleStoryboards.length === 0 && (
          <Caption
            key="empty"
            color="secondary"
            sx={{ px: SPACING.lg, py: SPACING.sm }}
          >
            No example storyboards are available.
          </Caption>
        ),
        ...exampleStoryboards.map((example) => (
          <MenuItemPrimitive
            key={example.slug}
            label={example.name}
            secondary={`${example.shotCount} shot${
              example.shotCount === 1 ? "" : "s"
            }, stills included`}
            onClick={() =>
              void installStoryboardExample(example.slug, example.name)
            }
            disabled={busy}
          />
        ))
      ]}
    </ContextMenu>
  );
};

export default OpenMenu;
