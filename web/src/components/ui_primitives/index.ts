/**
 * UI Primitives
 *
 * Re-exports all UI primitives for easy importing.
 * These primitives follow semantic design principles and are theme-driven.
 */

// Export slider component
export { NodeSlider } from "./NodeSlider";
export type { NodeSliderProps } from "./NodeSlider";

// Export dialog primitives
export { Dialog } from "./Dialog";
export type { DialogProps } from "./Dialog";

export { DialogActionButtons } from "./DialogActionButtons";
export type { DialogActionButtonsProps } from "./DialogActionButtons";

export { ToolbarIconButton } from "./ToolbarIconButton";
export type { ToolbarIconButtonProps } from "./ToolbarIconButton";

export { NavButton } from "./NavButton";
export type { NavButtonProps } from "./NavButton";

export { CreateFab } from "./CreateFab";
export type { CreateFabProps } from "./CreateFab";

export { PlaybackButton } from "./PlaybackButton";
export type { PlaybackButtonProps, PlaybackState, PlaybackAction } from "./PlaybackButton";

export { RunWorkflowButton } from "./RunWorkflowButton";
export type { RunWorkflowButtonProps } from "./RunWorkflowButton";

export { ExpandCollapseButton } from "./ExpandCollapseButton";
export type { ExpandCollapseButtonProps } from "./ExpandCollapseButton";

export { ViewModeToggle } from "./ViewModeToggle";
export type { ViewModeToggleProps, ViewModeOption } from "./ViewModeToggle";

export { RefreshButton } from "./RefreshButton";
export type { RefreshButtonProps } from "./RefreshButton";

export { SelectionControls } from "./SelectionControls";
export type { SelectionControlsProps } from "./SelectionControls";

// New action buttons
export { CopyButton } from "./CopyButton";
export type { CopyButtonProps } from "./CopyButton";

export { CloseButton } from "./CloseButton";
export type { CloseButtonProps } from "./CloseButton";

export { DeleteButton } from "./DeleteButton";
export type { DeleteButtonProps } from "./DeleteButton";

export { DownloadButton } from "./DownloadButton";
export type { DownloadButtonProps } from "./DownloadButton";

export { UploadButton } from "./UploadButton";
export type { UploadButtonProps } from "./UploadButton";

export { EditButton } from "./EditButton";
export type { EditButtonProps } from "./EditButton";

export { SettingsButton } from "./SettingsButton";
export type { SettingsButtonProps } from "./SettingsButton";

// Display & feedback primitives
export { ZoomControls } from "./ZoomControls";
export type { ZoomControlsProps } from "./ZoomControls";

export { FavoriteButton } from "./FavoriteButton";
export type { FavoriteButtonProps } from "./FavoriteButton";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps, EmptyStateVariant } from "./EmptyState";

export { LoadingSpinner } from "./LoadingSpinner";
export type { LoadingSpinnerProps, LoadingVariant } from "./LoadingSpinner";

export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";

export { ExternalLink } from "./ExternalLink";
export type { ExternalLinkProps } from "./ExternalLink";

export { StatusIndicator } from "./StatusIndicator";
export type { StatusIndicatorProps, StatusType } from "./StatusIndicator";

export { TagButton } from "./TagButton";
export type { TagButtonProps } from "./TagButton";

export { ThemeToggleButton } from "./ThemeToggleButton";
export type { ThemeToggleButtonProps } from "./ThemeToggleButton";

// Navigation & Layout primitives
export { SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";

export { Breadcrumbs } from "./Breadcrumbs";
export type { BreadcrumbsProps, BreadcrumbItem } from "./Breadcrumbs";

export { InfoTooltip } from "./InfoTooltip";
export type { InfoTooltipProps } from "./InfoTooltip";

export { WarningBanner } from "./WarningBanner";
export type { WarningBannerProps, BannerVariant } from "./WarningBanner";

export { NotificationBadge } from "./NotificationBadge";
export type { NotificationBadgeProps } from "./NotificationBadge";

export { UndoRedoButtons } from "./UndoRedoButtons";
export type { UndoRedoButtonsProps } from "./UndoRedoButtons";

export { ConfirmButton } from "./ConfirmButton";
export type { ConfirmButtonProps, ConfirmIconVariant } from "./ConfirmButton";

export { MenuItemPrimitive } from "./MenuItemPrimitive";
export type { MenuItemPrimitiveProps } from "./MenuItemPrimitive";

export { HelpButton } from "./HelpButton";
export type { HelpButtonProps, HelpIconVariant } from "./HelpButton";

// New composite/state buttons
export { StateIconButton } from "./StateIconButton";
export type { StateIconButtonProps } from "./StateIconButton";

export { LabeledToggle } from "./LabeledToggle";
export type { LabeledToggleProps } from "./LabeledToggle";

export { CircularActionButton } from "./CircularActionButton";
export type { CircularActionButtonProps } from "./CircularActionButton";

export { ActionButtonGroup } from "./ActionButtonGroup";
export type { ActionButtonGroupProps } from "./ActionButtonGroup";

// Re-export editor_ui primitives for convenience
export {
  NodeTextField,
  NodeSwitch,
  NodeSelect,
  NodeMenuItem,
  EditorButton,
  EditorMenu,
  EditorMenuItem
} from "../editor_ui";
export type {
  NodeTextFieldProps,
  NodeSwitchProps,
  NodeSelectProps,
  NodeMenuItemProps,
  EditorButtonProps
} from "../editor_ui";

// Re-export utilities
export {
  editorClassNames,
  reactFlowClasses,
  cn,
  stopPropagationHandlers,
  textFieldNodragSlotProps,
  editorUiClasses
} from "../editor_ui/editorUtils";

// Re-export context
export {
  EditorUiProvider,
  useEditorScope
} from "../editor_ui/EditorUiContext";
export type { EditorUiScope } from "../editor_ui/EditorUiContext";

// Layout primitives
export { FlexColumn } from "./FlexColumn";
export type { FlexColumnProps } from "./FlexColumn";

export { FlexRow } from "./FlexRow";
export type { FlexRowProps } from "./FlexRow";

export { Stack } from "./Stack";
export type { StackProps } from "./Stack";

export { Container } from "./Container";
export type { ContainerProps } from "./Container";

// Surface primitives
export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Panel } from "./Panel";
export type { PanelProps } from "./Panel";

// Typography primitives
export { Text } from "./Text";
export type { TextProps } from "./Text";

export { Label } from "./Label";
export type { LabelProps } from "./Label";

export { Caption } from "./Caption";
export type { CaptionProps } from "./Caption";

// Spacing utilities
export {
  SPACING,
  GAP,
  PADDING,
  MARGIN,
  getSpacingPx,
  createPadding,
  createMargin,
  resolveSpacing
} from "./spacing";
export type { SpacingValue } from "./spacing";
