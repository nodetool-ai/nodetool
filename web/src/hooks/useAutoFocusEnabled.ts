import { useMediaQuery } from "@mui/material";

/**
 * Whether focusing a field on mount/open is appropriate for this device.
 *
 * On touch devices focus raises the virtual keyboard, which covers most of the
 * panel that just opened — the sidebar list panels became unusable on mobile
 * web because their filter field grabbed focus every time. Search and filter
 * fields therefore stay unfocused on a coarse pointer; the user taps the field
 * when they actually want to type.
 *
 * Fields the user explicitly opened for typing (rename inputs, the chat
 * composer after tapping it) keep their focus — this is for focus the user
 * didn't ask for.
 */
export const useAutoFocusEnabled = (): boolean =>
  !useMediaQuery("(pointer: coarse)");

export default useAutoFocusEnabled;
