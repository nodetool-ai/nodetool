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
  LoadingSpinner
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

/** A section header inside the menu: quiet, uppercase-adjacent, padded. */
const MenuSectionLabel = ({ children }: { children: string }) => (
  <Caption color="muted" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
    {children}
  </Caption>
);

/**
 * The `[+]` menu for the workspace tab bar. Two sections: the guided
 * creation flows (one click creates the document at stage `idea` and opens
 * its tab on the flow) and the blank documents (as before). Starting a
 * project lives on the project selector to the left of New.
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
      maxWidth={340}
      maxHeight="70vh"
    >
      <FlexColumn
        sx={{
          width: 320,
          py: 0.5,
          // One icon size for every row: 16px beats the default MUI small
          // (20px), which crowded the label at this menu's density.
          "& .MuiSvgIcon-root": { fontSize: 16 }
        }}
      >
        {view === "root" && (
          <>
            <MenuSectionLabel>Guided flows</MenuSectionLabel>
            {starters.map((starter) => (
              <MenuItemPrimitive
                key={starter.id}
                label={starter.title}
                icon={starter.icon}
                secondary={starter.description}
                onClick={() => void starter.start()}
                disabled={busy}
              />
            ))}

            <Divider sx={{ my: 1 }} />
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
              <FlexRow justify="center" sx={{ py: 2 }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {!examplesLoading && exampleStoryboards.length === 0 && (
              <Caption color="secondary" sx={{ px: 2, py: 1.5 }}>
                No example storyboards are installed.
              </Caption>
            )}
            {exampleStoryboards.map((example) => (
              <MenuItemPrimitive
                key={example.slug}
                label={example.name}
                secondary={`${example.shotCount} shot${
                  example.shotCount === 1 ? "" : "s"
                }, already rendered`}
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
