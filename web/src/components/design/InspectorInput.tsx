import React, { memo, useRef, useEffect } from "react";
import { Box, Typography, InputBase } from "@mui/material";
import { useTheme, styled } from "@mui/material/styles";

interface InspectorInputProps {
  label?: React.ReactNode;
  icon?: React.ReactNode;
  value: number | string;
  onChange: (value: any) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  step?: number;
  adornment?: React.ReactNode;
  disabled?: boolean;
}

const StyledInputContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
  borderRadius: theme.shape.borderRadius,
  padding: "4px 8px",
  transition: "background-color 0.2s, box-shadow 0.2s",
  "&:hover": {
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)",
  },
  "&:focus-within": {
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)",
    boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
  }
}));

const StyledLabel = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  color: theme.palette.text.secondary,
  marginRight: 8,
  minWidth: 20,
  justifyContent: "center",
  userSelect: "none",
  "& svg": {
    fontSize: 16,
  },
  "& .MuiTypography-root": {
    fontSize: 12,
    fontWeight: 500,
  }
}));

const StyledInput = styled(InputBase)(({ theme }) => ({
  flex: 1,
  "& .MuiInputBase-input": {
    padding: 0,
    fontSize: 13,
    textAlign: "right",
    height: "24px",
    "&::-webkit-inner-spin-button, &::-webkit-outer-spin-button": {
      WebkitAppearance: "none",
      margin: 0,
    },
  },
}));

export const InspectorInput: React.FC<InspectorInputProps> = memo(({
  label,
  icon,
  value,
  onChange,
  type = "text",
  min,
  max,
  step = 1,
  adornment,
  disabled
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === "number") {
      const val = parseFloat(e.target.value);
      if (isNaN(val) && e.target.value !== "" && e.target.value !== "-") return;
      onChange(val);
    } else {
      onChange(e.target.value);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (type === "number") {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 0;
      if (min !== undefined) val = Math.max(min, val);
      if (max !== undefined) val = Math.min(max, val);
      onChange(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (type === "number" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const currentVal = parseFloat(value as string) || 0;
      const direction = e.key === "ArrowUp" ? 1 : -1;
      const multiplier = e.shiftKey ? 10 : 1;
      const newVal = currentVal + (step * direction * multiplier);
      
      let clamped = newVal;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      
      onChange(clamped);
    }
  };

  return (
    <StyledInputContainer sx={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      {(label || icon) && (
        <StyledLabel>
          {icon}
          {label && !icon && <Typography>{label}</Typography>}
        </StyledLabel>
      )}
      <StyledInput
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        type={type === "number" ? "text" : "text"} // Use text to allow custom handling
        inputMode={type === "number" ? "numeric" : "text"}
        disabled={disabled}
      />
      {adornment && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, userSelect: "none" }}>
          {adornment}
        </Typography>
      )}
    </StyledInputContainer>
  );
});

InspectorInput.displayName = "InspectorInput";
