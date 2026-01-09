/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import {
  Typography,
  Tabs,
  Tab,
  Box,
  Dialog,
  DialogContent,
  TextField
} from "@mui/material";
import CloseButton from "../../buttons/CloseButton";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import DataTypesList from "./DataTypesList";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useState, useMemo, Fragment } from "react";
import { DATA_TYPES } from "../../../config/data_types";
import KeyboardShortcutsView from "./KeyboardShortcutsView";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut
} from "../../../config/shortcuts";
import { isMac as checkIsMac } from "../../../utils/platform";

interface HelpItem {
  text: string;
  buttons?: string[];
  isButtonBorderless?: boolean[];
  details?: string;
}

interface _HelpItemGroup {
  category?: string;
  subCategory?: string;
  explanation?: string;
  items?: HelpItem[];
}

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

const humanizeKey = (key: string): string => {
  switch (key.toLowerCase()) {
    case "control":
      return "CTRL";
    case "meta":
      return checkIsMac() ? "⌘" : "WIN";
    case "alt":
      return checkIsMac() ? "OPT" : "ALT";
    case "shift":
      return "SHIFT";
    case " ":
    case "space":
      return "SPACE";
    case "arrowup":
      return "↑";
    case "arrowdown":
      return "↓";
    case "arrowleft":
      return "←";
    case "arrowright":
      return "→";
    case "escape":
    case "esc":
      return "ESC";
    case "enter":
      return "ENTER";
    case "backspace":
      return "BACKSPACE";
    case "tab":
      return "TAB";
    case "delete":
      return "DEL";
    case "pageup":
      return "PGUP";
    case "pagedown":
      return "PGDN";
    case "home":
      return "HOME";
    case "end":
      return "END";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const renderKeyCombo = (combo: string[]): React.ReactNode => {
  return (
    <Box component="span" className="combo">
      {combo.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <span style={{ margin: "0 0.25em" }}>+</span>}
          <kbd className="kbd">{humanizeKey(key)}</kbd>
        </Fragment>
      ))}
    </Box>
  );
};

interface ShortcutsTabProps {
  shortcuts: Shortcut[];
  categories: Array<keyof typeof SHORTCUT_CATEGORIES>;
}

const AllShortcutsTabContent: React.FC<ShortcutsTabProps> = ({
  shortcuts,
  categories
}) => {
  if (shortcuts.length === 0) {
    return (
      <Box className="no-results">
        <Typography variant="body1">No shortcuts found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {categories.map((cat) => {
        const list = shortcuts.filter((s) => s.category === cat);
        if (!list.length) {return null;}
        return (
          <Box key={cat} className="category-section">
            <Typography className="category-title">
              {SHORTCUT_CATEGORIES[cat]}
            </Typography>
            {list.map((s) => (
              <ShortcutRow key={s.slug} shortcut={s} />
            ))}
          </Box>
        );
      })}
    </Box>
  );
};

interface CategoryTabProps extends ShortcutsTabProps {
  category: "editor" | "panel" | "assets" | "workflow";
}

const CategoryShortcutsTabContent: React.FC<CategoryTabProps> = ({
  shortcuts,
  category
}) => {
  const categoryList = shortcuts.filter((s) => s.category === category);

  if (categoryList.length === 0) {
    return (
      <Box className="no-results">
        <Typography variant="body1">
          No shortcuts found for this category
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box className="category-section">
        <Typography className="category-title">
          {SHORTCUT_CATEGORIES[category]}
        </Typography>
        {categoryList.map((s) => (
          <ShortcutRow key={s.slug} shortcut={s} />
        ))}
      </Box>
    </Box>
  );
};

interface ShortcutRowProps {
  shortcut: Shortcut;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ shortcut }) => {
  const displayCombo = checkIsMac()
    ? shortcut.keyComboMac ?? shortcut.keyCombo
    : shortcut.keyCombo;

  return (
    <Box className="shortcut-row">
      <Typography className="shortcut-title">{shortcut.title}</Typography>
      <Box className="shortcut-keys">
        {renderKeyCombo(displayCombo)}
      </Box>
      {shortcut.description && (
        <Typography className="shortcut-description">
          {shortcut.description}
        </Typography>
      )}
    </Box>
  );
};

const ConsolidatedShortcutsTab: React.FC = () => {
  const [search, setSearch] = useState("");
  const [tabValue, setTabValue] = useState(0);
  const lower = search.toLowerCase();

  const filteredShortcuts = useMemo(() => {
    if (!lower) {return NODE_EDITOR_SHORTCUTS;}
    return NODE_EDITOR_SHORTCUTS.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)) ||
        s.keyCombo.some((k) => k.toLowerCase().includes(lower))
    );
  }, [lower]);

  const categories = useMemo<Array<keyof typeof SHORTCUT_CATEGORIES>>(
    () => Object.keys(SHORTCUT_CATEGORIES) as Array<keyof typeof SHORTCUT_CATEGORIES>,
    []
  );

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        sx={{ mb: 1, borderBottom: `1px solid ${"divider"}` }}
      >
        <Tab label="All Shortcuts" sx={{ minHeight: 40, py: 0 }} />
        <Tab label="Editor" sx={{ minHeight: 40, py: 0 }} />
        <Tab label="Workflow" sx={{ minHeight: 40, py: 0 }} />
        <Tab label="Panels" sx={{ minHeight: 40, py: 0 }} />
      </Tabs>
      <TextField
        variant="outlined"
        size="small"
        placeholder="Search shortcuts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2 }}
      />
      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {tabValue === 0 && (
          <AllShortcutsTabContent
            shortcuts={filteredShortcuts}
            categories={categories}
          />
        )}
        {tabValue === 1 && (
          <CategoryShortcutsTabContent
            shortcuts={filteredShortcuts}
            category="editor"
            categories={categories}
          />
        )}
        {tabValue === 2 && (
          <CategoryShortcutsTabContent
            shortcuts={filteredShortcuts}
            category="workflow"
            categories={categories}
          />
        )}
        {tabValue === 3 && (
          <CategoryShortcutsTabContent
            shortcuts={filteredShortcuts}
            category="panel"
            categories={categories}
          />
        )}
      </Box>
    </Box>
  );
};

const helpStyles = (theme: Theme) =>
  css({
    height: "100%",
    ".help": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: ".1em",
      overflow: "hidden"
    },

    ".top": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "0.5em",
      padding: "0em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[600]}`
    },
    ".content": {
      height: "calc(100% - 40px)",
      padding: "0 1em 2em 1em"
    },
    ".help-tabs": {
      margin: "0 1em 1em 1em",
      paddingTop: "0",
      lineHeight: "1.5",
      "& .MuiTabs-indicator": {
        backgroundColor: "var(--palette-primary-main)",
        height: "3px",
        borderRadius: "1.5px"
      },
      "& .MuiTab-root": {
        color: theme.vars.palette.grey[200],
        transition: "color 0.2s ease",
        paddingBottom: "0em",
        "&.Mui-selected": {
          color: theme.vars.palette.grey[0]
        },
        "&:hover": {
          color: theme.vars.palette.grey[0]
        }
      },
      button: {
        alignItems: "flex-start",
        textAlign: "left",
        paddingLeft: "0",
        marginRight: "0.5em",
        minWidth: "unset"
      }
    },
    ".tabpanel": {
      height: "calc(100% - 40px)",
      padding: "1em 0",
      fontSize: "var(--fontSizeBig)"
    },
    ".tabpanel-content": {
      height: "100%",
      overflowY: "auto",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.grey[800]
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[500],
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[400]
      }
    },
    ".help-item": {
      marginBottom: "0.25em",
      paddingBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      gap: "1rem",
      p: {
        minWidth: "240px"
      },
      button: {
        marginTop: "2px",
        color: theme.vars.palette.grey[200],
        border: `1px solid ${theme.vars.palette.grey[600]}`,
        padding: "1px 6px",
        textAlign: "left",
        lineHeight: "1.3em",
        minWidth: "unset",
        fontSize: "0.85em",
        height: "auto",
        "&.no-border": {
          border: "0"
        }
      }
    },
    ".explanation": {
      marginBottom: "1em",
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.grey[200]
    },
    ".category-section": {
      marginBottom: "1.5em"
    },
    ".category-title": {
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.75em",
      paddingBottom: "0.25em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".shortcut-row": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em 0",
      gap: "1em",
      "&:not(:last-child)": {
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }
    },
    ".shortcut-title": {
      minWidth: "160px",
      fontSize: "0.9375rem",
      color: theme.vars.palette.text.primary
    },
    ".shortcut-keys": {
      minWidth: "180px",
      display: "flex",
      alignItems: "center",
      gap: "0.25em"
    },
    ".shortcut-description": {
      flex: 1,
      fontSize: "0.875rem",
      color: theme.vars.palette.text.secondary,
      fontWeight: 400
    },
    ".kbd": {
      display: "inline-block",
      padding: "0.2em 0.5em",
      fontSize: "0.75em",
      fontFamily: "monospace",
      fontWeight: 600,
      lineHeight: 1,
      color: theme.vars.palette.text.primary,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "4px",
      boxShadow: `0 1px 2px ${theme.vars.palette.grey[900]}80`
    },
    ".no-results": {
      textAlign: "center",
      padding: "2em",
      color: theme.vars.palette.text.secondary
    }
  });

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div
      role="tabpanel"
      className="tabpanel"
      hidden={value !== index}
      id={`help-tabpanel-${index}`}
      aria-labelledby={`help-tab-${index}`}
    >
      {value === index && <Box className="tabpanel-content">{children}</Box>}
    </div>
  );
}

const Help = ({
  open,
  handleClose
}: {
  open: boolean;
  handleClose: () => void;
}) => {
  const { helpIndex, setHelpIndex } = useAppHeaderStore();
  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setHelpIndex(newValue);
  };
  const [expandedNodetool, setExpandedNodetool] = useState(true);
  const [expandedComfy, setExpandedComfy] = useState(false);

  const theme = useTheme();

  const nodetoolTypes = DATA_TYPES.filter(
    (type) => !type.value.startsWith("comfy.")
  );
  const comfyTypes = DATA_TYPES.filter((type) =>
    type.value.startsWith("comfy.")
  );

  const handleAccordionChange =
    (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
      if (panel === "nodetool") {
        setExpandedNodetool(isExpanded);
      } else if (panel === "comfy") {
        setExpandedComfy(isExpanded);
      }
    };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="md"
      sx={{
        "& .MuiDialog-paper": {
          width: "70vw",
          minWidth: "600px",
          maxWidth: "1000px",
          height: "85vh",
          margin: "auto",
          borderRadius: theme.vars.rounded.dialog,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundColor: theme.vars.palette.glass.backgroundDialogContent
        }
      }}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        }
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <div css={helpStyles(theme)}>
          <div className="help">
            <div className="top">
              <Typography variant="h2">Help</Typography>
              <CloseButton onClick={handleClose} />
            </div>
            <Tabs
              className="help-tabs"
              value={helpIndex}
              onChange={handleChange}
              aria-label="help tabs"
            >
              <Tab label="Shortcuts" id="help-tab-0" />
              <Tab label="Keyboard" id="help-tab-1" />
              <Tab label="DataTypes" id="help-tab-2" />
            </Tabs>
            <div className="content">
              <TabPanel value={helpIndex} index={0}>
                <ConsolidatedShortcutsTab />
              </TabPanel>
              <TabPanel value={helpIndex} index={1}>
                <KeyboardShortcutsView shortcuts={NODE_EDITOR_SHORTCUTS} />
              </TabPanel>
              <TabPanel value={helpIndex} index={2}>
                <DataTypesList
                  title="Nodetool Data Types"
                  dataTypes={nodetoolTypes}
                  expanded={expandedNodetool}
                  onChange={handleAccordionChange("nodetool")}
                />
                <DataTypesList
                  title="Comfy Data Types"
                  dataTypes={comfyTypes}
                  expanded={expandedComfy}
                  onChange={handleAccordionChange("comfy")}
                />
              </TabPanel>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Help;
