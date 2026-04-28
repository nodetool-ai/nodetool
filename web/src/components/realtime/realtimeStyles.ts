export const realtimeCardSx = {
  borderRadius: 0
};

export const realtimeControlSx = {
  borderRadius: 0,
  borderStyle: "solid",
  borderWidth: 1,
  fontWeight: 600,
  height: 34,
  px: 2,
  "&:not(:disabled)": {
    backgroundColor: "action.hover",
    borderColor: "divider"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "action.selected",
    borderColor: "text.secondary"
  }
};

export const realtimeStartControlSx = {
  ...realtimeControlSx,
  "&:not(:disabled)": {
    backgroundColor: "success.dark",
    borderColor: "success.main",
    color: "success.contrastText"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "success.main",
    borderColor: "success.light"
  }
};

export const realtimeStopControlSx = {
  ...realtimeControlSx,
  "&:not(:disabled)": {
    backgroundColor: "error.dark",
    borderColor: "error.main",
    color: "error.contrastText"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "error.main",
    borderColor: "error.light"
  }
};

export const realtimeTextInputSx = {
  "& .MuiInputBase-root": {
    borderRadius: 0
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderRadius: 0
  }
};

export const realtimeMediaSx = {
  borderRadius: 0
};

export const realtimePreviewPaneSx = {
  alignItems: "center",
  backgroundColor: "background.default",
  borderColor: "divider",
  borderStyle: "solid",
  borderWidth: 1,
  boxSizing: "border-box",
  height: "clamp(220px, 24vh, 280px)",
  justifyContent: "center",
  minHeight: 220,
  overflow: "hidden",
  p: 2,
  ...realtimeMediaSx
};
