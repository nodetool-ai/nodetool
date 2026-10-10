import { useCallback, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

import {
  Popover,
  MenuItemPrimitive,
  FlexColumn,
  FlexRow,
  Caption,
  Divider,
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

/** The menu's column width, and the popover's room around it, in px. */
const MENU_WIDTH = 320;
const MENU_MAX_WIDTH = 340;

/** A section header inside the menu: quiet, uppercase-adjacent, padded. */
const MenuSectionLabel = ({ children }: { children: string }) => (
  <Caption
    color="muted"
    sx={{ px: SPACING.md, pt: SPACING.sm, pb: SPACING.micro }}
  >
    {children}
  </Caption>
);

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

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={close}
      placement="bottom-left"
      maxWidth={MENU_MAX_WIDTH}
      maxHeight="70vh"
    >
      <FlexColumn
        sx={{
          width: MENU_WIDTH,
          py: SPACING.micro,
          // One icon size for every row: 16px beats the default MUI small
          // (20px), which crowded the label at this menu's density.
          "& .MuiSvgIcon-root": { fontSize: 16 }
        }}
      >
        {view === "root" && (
          <>
            <MenuSectionLabel>Guided flows</MenuSectionLabel>
            {/* The item being started says so, as the New Project cards do,
                so the disabled menu does not read as a dead click. */}
            {starters.map((starter) => (
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
            ))}

            <Divider sx={{ my: SPACING.xs }} />
            <MenuSectionLabel>Blank documents</MenuSectionLabel>
            {entries.map((entry) => (
              <MenuItemPrimitive
                key={entry.key}
                label={entry.menuLabel}
                icon={entry.icon}
                hasSubmenu={entry.submenu !== undefined}
                onClick={() =>
                  entry.submenu
                    ? setView(entry.submenu)
                    : void entry.create?.()
                }
                disabled={busy}
              />
            ))}
          </>
        )}

        {view === "texts" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            {TEXT_FILE_TEMPLATES.map((template) => (
              <MenuItemPrimitive
                key={template.filename}
                label={template.label}
                onClick={() => void createTextFile(template)}
                disabled={busy}
              />
            ))}
          </>
        )}

        {view === "storyboards" && (
          <>
            <MenuItemPrimitive
              label="Back"
              icon={<ArrowBackRoundedIcon fontSize="small" />}
              onClick={() => setView("root")}
              dividerAfter
            />
            <MenuItemPrimitive
              label="Blank storyboard"
              icon={<AddRoundedIcon fontSize="small" />}
              onClick={() => void createBlankStoryboard()}
              disabled={busy}
              dividerAfter
            />
            {examplesLoading && (
              <FlexRow justify="center" sx={{ py: SPACING.md }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {!examplesLoading && exampleStoryboards.length === 0 && (
              <Caption color="secondary" sx={{ px: SPACING.md, py: SPACING.sm }}>
                No example storyboards are available.
              </Caption>
            )}
            {exampleStoryboards.map((example) => (
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
            ))}
          </>
        )}
      </FlexColumn>
    </Popover>
  );
};

export default OpenMenu;
