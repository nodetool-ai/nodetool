export const realtimeCardSx = {
  borderRadius: 0
};

export const realtimeControlSx = {
  borderRadius: 0,
  fontWeight: 600,
  height: 34,
  px: 2,
  textShadow: "none",
  "& .MuiButton-label": {
    color: "inherit"
  },
  "&:not(:disabled)": {
    backgroundColor: "action.selected",
    color: "text.primary"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "action.hover"
  }
};

export const realtimeStartControlSx = {
  ...realtimeControlSx,
  "&:not(:disabled)": {
    backgroundColor: "success.dark",
    color: "grey.0"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "success.main",
    color: "grey.0"
  }
};

export const realtimeStopControlSx = {
  ...realtimeControlSx,
  "&:not(:disabled)": {
    backgroundColor: "error.dark",
    color: "grey.0"
  },
  "&:not(:disabled):hover": {
    backgroundColor: "error.main",
    color: "grey.0"
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
