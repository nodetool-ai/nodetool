/** @jsxImportSource @emotion/react */
import React, { useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CheckIcon from "@mui/icons-material/Check";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Text } from "../ui_primitives/Text";
import type { OutputSlot } from "../../stores/ApiTypes";

interface OutputSelectorProps {
  outputs: OutputSlot[];
  selectedOutput: string;
  onSelect: (name: string) => void;
}

function formatType(type: { type: string; type_args: Array<{ type: string }> }): string {
  if (type.type_args.length > 0) return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  return type.type;
}

export const OutputSelector: React.FC<OutputSelectorProps> = ({ outputs, selectedOutput, onSelect }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const selected = outputs.find((o) => o.name === selectedOutput);

  if (outputs.length <= 1) return null;

  return (
    <>
      <Box
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.25,
          py: 0.5,
          borderRadius: 1,
          border: `1px solid ${theme.vars.palette.primary.main}30`,
          backgroundColor: `${theme.vars.palette.primary.main}12`,
          cursor: "pointer",
          "&:hover": { backgroundColor: `${theme.vars.palette.primary.main}20` },
          transition: "all 0.15s",
        }}
      >
        <AccountTreeOutlinedIcon sx={{ fontSize: 14, color: theme.vars.palette.primary.main }} />
        <Text size="smaller" weight={600} sx={{ color: theme.vars.palette.primary.main }}>
          Output: {selected?.name ?? selectedOutput}
        </Text>
        <Text size="tiny" sx={{ color: `${theme.vars.palette.primary.main}99` }}>
          {selected ? formatType(selected.type) : ""}
        </Text>
        <ExpandMoreIcon sx={{ fontSize: 14, color: theme.vars.palette.primary.main }} />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        {outputs.map((o) => (
          <MenuItem
            key={o.name}
            selected={o.name === selectedOutput}
            onClick={() => { onSelect(o.name); setAnchorEl(null); }}
          >
            <ListItemText
              primary={o.name}
              secondary={formatType(o.type)}
            />
            {o.name === selectedOutput && (
              <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                <CheckIcon sx={{ fontSize: 18, color: theme.vars.palette.primary.main }} />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
