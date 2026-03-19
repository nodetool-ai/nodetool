import React, { memo, useCallback } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  Button,
  CircularProgress
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { WorkspaceResponse } from "../../stores/ApiTypes";

type VibeCodingMode = "chat" | "wysiwyg" | "theme";

interface VibeCodingToolbarProps {
  workspaces: WorkspaceResponse[] | undefined;
  selectedWorkspaceId: string | undefined;
  onWorkspaceChange: (workspaceId: string) => void;
  isLoadingWorkspaces: boolean;
  mode: VibeCodingMode;
  onModeChange: (mode: VibeCodingMode) => void;
}

const VibeCodingToolbar: React.FC<VibeCodingToolbarProps> = ({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  isLoadingWorkspaces,
  mode,
  onModeChange
}) => {
  const handleWorkspaceSelect = useCallback(
    (event: SelectChangeEvent<string>) => {
      onWorkspaceChange(event.target.value);
    },
    [onWorkspaceChange]
  );

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: 4,
        py: 2,
        backgroundColor: (theme) => theme.palette.background.default,
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
        gap: 3,
        minHeight: 48
      }}
    >
      {/* Left: Logo + Workspace picker */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 600, color: "primary.main" }}
        >
          ⚡ VibeCoding
        </Typography>

        <Select
          size="small"
          value={selectedWorkspaceId ?? ""}
          onChange={handleWorkspaceSelect}
          displayEmpty
          disabled={isLoadingWorkspaces}
          MenuProps={{
            sx: { zIndex: 1500 },
            disablePortal: false
          }}
          sx={{
            minWidth: 180,
            fontSize: "0.8125rem",
            "& .MuiSelect-select": { py: 1 }
          }}
        >
          <MenuItem value="" disabled>
            {isLoadingWorkspaces ? "Loading…" : "Select workspace"}
          </MenuItem>
          {workspaces?.map((ws) => (
            <MenuItem key={ws.id} value={ws.id}>
              {ws.name}
            </MenuItem>
          ))}
        </Select>

        {isLoadingWorkspaces && <CircularProgress size={16} />}
      </Box>

      {/* Center: Mode tabs */}
      <Box
        sx={{
          display: "flex",
          bgcolor: "action.hover",
          borderRadius: "20px",
          p: "2px"
        }}
      >
        {(["chat", "wysiwyg", "theme"] as const).map((m) => (
          <Box
            key={m}
            onClick={() => m === "chat" && onModeChange(m)}
            sx={{
              px: 3,
              py: 1,
              borderRadius: "18px",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: m === "chat" ? "pointer" : "default",
              textTransform: "capitalize",
              transition: "all 0.15s",
              ...(m === mode
                ? {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    opacity: 1
                  }
                : {
                    color: m === "chat" ? "text.secondary" : "text.disabled",
                    opacity: m === "chat" ? 1 : 0.5
                  })
            }}
          >
            {m === "wysiwyg" ? "WYSIWYG" : m.charAt(0).toUpperCase() + m.slice(1)}
          </Box>
        ))}
      </Box>

      {/* Right: Action buttons */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Button
          size="small"
          variant="outlined"
          disabled
          sx={{
            fontSize: "0.75rem",
            borderColor: "success.main",
            color: "success.main",
            "&.Mui-disabled": { borderColor: "divider", color: "text.disabled" }
          }}
        >
          Publish
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled
          sx={{ fontSize: "0.75rem" }}
        >
          Deploy ↗
        </Button>
      </Box>
    </Box>
  );
};

export default memo(VibeCodingToolbar);
