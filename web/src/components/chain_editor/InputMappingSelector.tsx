/** @jsxImportSource @emotion/react */
import React, { useState, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Box, Menu, MenuItem, ListItemText, ListItemIcon } from "@mui/material";
import InputOutlinedIcon from "@mui/icons-material/InputOutlined";
import CheckIcon from "@mui/icons-material/Check";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Text } from "../ui_primitives/Text";
import type { Property, TypeMetadata } from "../../stores/ApiTypes";
import { areTypesCompatible } from "./chainTypes";

interface InputMappingSelectorProps {
  properties: Property[];
  selectedInput: string | null;
  sourceOutputType: TypeMetadata | null;
  onSelect: (name: string) => void;
}

function formatType(type: TypeMetadata): string {
  if (type.type_args.length > 0) return `${type.type}[${type.type_args.map((a) => a.type).join(", ")}]`;
  return type.type;
}

export const InputMappingSelector: React.FC<InputMappingSelectorProps> = ({
  properties, selectedInput, sourceOutputType, onSelect,
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const compatibleSet = useMemo(() => {
    if (!sourceOutputType) return new Set(properties.map((p) => p.name));
    return new Set(properties.filter((p) => areTypesCompatible(sourceOutputType, p.type)).map((p) => p.name));
  }, [properties, sourceOutputType]);

  const sortedProps = useMemo(() => {
    const compat = properties.filter((p) => compatibleSet.has(p.name));
    const incompat = properties.filter((p) => !compatibleSet.has(p.name));
    return [...compat, ...incompat];
  }, [properties, compatibleSet]);

  const selected = properties.find((p) => p.name === selectedInput);
  if (!selectedInput && compatibleSet.size === 0) return null;

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
          border: `1px solid ${theme.vars.palette.secondary.main}30`,
          backgroundColor: `${theme.vars.palette.secondary.main}12`,
          cursor: "pointer",
          "&:hover": { backgroundColor: `${theme.vars.palette.secondary.main}20` },
          transition: "all 0.15s",
        }}
      >
        <InputOutlinedIcon sx={{ fontSize: 14, color: theme.vars.palette.secondary.main }} />
        <Text size="smaller" weight={600} sx={{ color: theme.vars.palette.secondary.main }}>
          Input: {selected?.title ?? selected?.name ?? selectedInput ?? "none"}
        </Text>
        <ExpandMoreIcon sx={{ fontSize: 14, color: theme.vars.palette.secondary.main }} />
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 260, maxHeight: 400 } } }}
      >
        {sortedProps.map((p) => {
          const isCompat = compatibleSet.has(p.name);
          const isSelected = p.name === selectedInput;
          return (
            <MenuItem
              key={p.name}
              selected={isSelected}
              onClick={() => { onSelect(p.name); setAnchorEl(null); }}
              sx={{ opacity: isCompat ? 1 : 0.4 }}
            >
              <ListItemText
                primary={p.title ?? p.name}
                secondary={`${formatType(p.type)}${p.description ? ` — ${p.description}` : ""}`}
              />
              {isSelected && (
                <ListItemIcon sx={{ minWidth: "auto", ml: 1 }}>
                  <CheckIcon sx={{ fontSize: 18, color: theme.vars.palette.secondary.main }} />
                </ListItemIcon>
              )}
              {!isCompat && (
                <WarningAmberIcon sx={{ fontSize: 16, color: theme.vars.palette.warning.main, ml: 1 }} />
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};
