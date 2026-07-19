/**
 * Low-level MUI re-exports
 *
 * The single sanctioned home for the structural / control MUI components that
 * the app still needs but that have no richer primitive of their own (lists,
 * dialog sub-parts, form controls, plain menus/selects/switches, tabs, etc.).
 *
 * These are intentionally thin pass-throughs (same pattern as `Box.tsx`).
 * How they pick up the design system:
 *
 * - Interactive controls (Button, Tabs, Tab, ToggleButton, Accordion,
 *   LinearProgress, Modal, Toolbar, Tooltip, Select/Switch/Menu/MenuItem/
 *   OutlinedInput via editorControls) carry explicit `Mui*` overrides in
 *   `ThemeNodetool` / `themes/components/editorControls.ts`. If you re-export
 *   a new interactive control, add its override in the same PR or it renders
 *   stock MUI.
 * - Structural components (the List and Dialog sub-part families, form
 *   wrappers, InputAdornment, Fade, Drawer, Fab, IconButton) inherit
 *   palette + typography from the theme baseline and deliberately have no
 *   per-component override.
 *
 * Routing them through the primitives barrel means application code imports
 * from `ui_primitives`, never from `@mui/material` directly, so the design
 * system stays the single seam over MUI.
 *
 * Prefer a semantic primitive when one fits (`ToolbarIconButton` over
 * `IconButton`, `SelectField` over `Select`, `LabeledSwitch` over `Switch`,
 * `TabGroup` over `Tabs`, `CollapsibleSection` over `Accordion`, …). Reach for
 * these low-level forms only when you need the raw building block.
 */

// List family
export {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  ListSubheader
} from "@mui/material";
export type {
  ListProps,
  ListItemProps,
  ListItemButtonProps,
  ListItemIconProps,
  ListItemTextProps,
  ListItemAvatarProps,
  ListSubheaderProps
} from "@mui/material";

// Dialog sub-parts (the `Dialog` shell itself is the richer ./Dialog primitive)
export {
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from "@mui/material";
export type {
  DialogTitleProps,
  DialogContentProps,
  DialogContentTextProps,
  DialogActionsProps
} from "@mui/material";

// Form controls
export {
  FormControl,
  FormGroup,
  FormHelperText,
  FormControlLabel,
  InputLabel,
  InputAdornment,
  OutlinedInput,
  Input
} from "@mui/material";
export type {
  FormControlProps,
  FormGroupProps,
  FormHelperTextProps,
  FormControlLabelProps,
  InputLabelProps,
  InputAdornmentProps,
  OutlinedInputProps,
  InputProps
} from "@mui/material";

// Plain menus, selects, switches, inputs, buttons
export {
  Menu,
  MenuItem,
  MenuList,
  Select,
  Switch,
  TextField,
  IconButton,
  Button,
  ButtonBase,
  Drawer,
  Fab
} from "@mui/material";
export type {
  MenuProps,
  MenuItemProps,
  MenuListProps,
  SelectProps,
  SelectChangeEvent,
  SwitchProps,
  TextFieldProps,
  IconButtonProps,
  ButtonProps,
  ButtonBaseProps,
  DrawerProps,
  FabProps
} from "@mui/material";

// Disclosure
export { Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
export type {
  AccordionProps,
  AccordionSummaryProps,
  AccordionDetailsProps
} from "@mui/material";

// Tabs
export { Tabs, Tab } from "@mui/material";
export type { TabsProps, TabProps } from "@mui/material";

// Toggle buttons
export { ToggleButton, ToggleButtonGroup } from "@mui/material";
export type { ToggleButtonProps, ToggleButtonGroupProps } from "@mui/material";

// Overlay / transition / chrome
export { Modal, Fade, Toolbar, LinearProgress } from "@mui/material";
export type {
  ModalProps,
  FadeProps,
  ToolbarProps,
  LinearProgressProps
} from "@mui/material";

// Raw escape hatches for the two components whose richer primitives
// (`./Dialog`, `./Autocomplete`) intentionally reshape the API. A handful of
// call sites need the unopinionated MUI component (custom `renderInput`,
// composed `DialogTitle`/`DialogContent` children); they import these so the
// dependency on `@mui/material` still lives only in the primitive layer.
export { Autocomplete as MuiAutocomplete, Dialog as MuiDialog } from "@mui/material";
export type {
  AutocompleteProps as MuiAutocompleteProps,
  DialogProps as MuiDialogProps
} from "@mui/material";
