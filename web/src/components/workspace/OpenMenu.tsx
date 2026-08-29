import { useCallback, useMemo, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

import {
  Popover,
  MenuItemPrimitive,
  FlexColumn,
  FlexRow,
  Caption,
  LoadingSpinner
} from "../ui_primitives";
import { useExampleStoryboards } from "../../hooks/storyboard/useStoryboards";
import { useOpenNewProjectTab } from "../../hooks/useProjects";
import { PROJECT_GLYPH } from "../projects/projectIdentity";
import {
  TEXT_FILE_TEMPLATES,
  useNewDocumentCatalog,
  type NewDocumentSubmenu
} from "./newDocumentCatalog";

interface OpenMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

type MenuView = "root" | NewDocumentSubmenu;

/**
 * The `[+]` menu for the workspace tab bar. A project comes first — it is what
 * most new work starts as — and the blank documents keep their list below it.
 */
const OpenMenu = ({ anchorEl, open, onClose }: OpenMenuProps) => {
  const [view, setView] = useState<MenuView>("root");

  const close = useCallback(() => {
    setView("root");
    onClose();
  }, [onClose]);

  const openNewProject = useOpenNewProjectTab();
  const {
    entries,
    createTextFile,
    createBlankStoryboard,
    installStoryboardExample,
    creating
  } = useNewDocumentCatalog({}, close);

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
      <FlexColumn sx={{ width: 320, py: 0.5 }}>
        {view === "root" && (
          <>
            <MenuItemPrimitive
              label="Start a project…"
              secondary="An agent plans and builds its documents"
              icon={<span aria-hidden>{PROJECT_GLYPH}</span>}
              dividerAfter
              onClick={() => {
                close();
                openNewProject();
              }}
            />
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
                disabled={creating !== null}
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
                disabled={creating !== null}
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
              disabled={creating !== null}
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
                disabled={creating !== null}
              />
            ))}
          </>
        )}
      </FlexColumn>
    </Popover>
  );
};

export default OpenMenu;
