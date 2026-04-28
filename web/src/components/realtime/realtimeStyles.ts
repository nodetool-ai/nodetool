export const realtimeCardSx = {
  borderRadius: 0
};

export const realtimeControlSx = {
  borderRadius: 0
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
