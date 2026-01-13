import React, { memo, useEffect, useState, useRef, useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useConnectionStore from "../../stores/ConnectionStore";
import { typeToString } from "../../utils/TypeHandler";
import { DATA_TYPES, DataType } from "../../config/data_types";

interface IndicatorPosition {
  x: number;
  y: number;
}

const ConnectionTypeIndicator: React.FC = () => {
  const theme = useTheme();
  const connecting = useConnectionStore((state) => state.connecting);
  const connectType = useConnectionStore((state) => state.connectType);
  const connectDirection = useConnectionStore((state) => state.connectDirection);
  const [position, setPosition] = useState<IndicatorPosition | null>(null);
  const rafRef = useRef<number | null>(null);

  const dataTypesMap = useMemo(() => {
    const map = new Map<string, DataType>();
    DATA_TYPES.forEach((dt) => {
      map.set(dt.value, dt);
    });
    return map;
  }, []);

  useEffect(() => {
    if (!connecting) {
      setPosition(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        setPosition({
          x: event.clientX,
          y: event.clientY
        });
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [connecting]);

  if (!connecting || !connectType || !position) {
    return null;
  }

  const typeName = connectType.type || "unknown";
  const typeLabel = typeToString(connectType);
  const dataTypeConfig = dataTypesMap.get(typeName);
  const typeColor = dataTypeConfig?.color || theme.palette.grey[500];
  const directionLabel = connectDirection === "source" ? "Output" : "Input";

  return (
    <Box
      sx={{
        position: "fixed",
        left: position.x + 20,
        top: position.y - 40,
        pointerEvents: "none",
        zIndex: theme.zIndex.tooltip + 100,
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.5,
        bgcolor: theme.palette.mode === "dark"
          ? "rgba(15, 23, 42, 0.95)"
          : "rgba(255, 255, 255, 0.97)",
        borderRadius: 1,
        boxShadow: theme.palette.mode === "dark"
          ? "0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)"
          : "0 4px 16px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        backdropFilter: "blur(8px)",
        transform: "translateY(-100%)",
        transition: "opacity 150ms ease-out",
        opacity: 1
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: typeColor,
          flexShrink: 0,
          boxShadow: `0 0 6px ${typeColor}40`
        }}
      />
      <Typography
        variant="caption"
        sx={{
          color: theme.palette.mode === "dark"
            ? "rgba(226, 232, 240, 0.95)"
            : "rgba(30, 41, 59, 0.95)",
          fontWeight: 500,
          fontSize: "0.7rem",
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          lineHeight: 1.2
        }}
      >
        {directionLabel}: {typeLabel}
      </Typography>
    </Box>
  );
};

export default memo(ConnectionTypeIndicator);
