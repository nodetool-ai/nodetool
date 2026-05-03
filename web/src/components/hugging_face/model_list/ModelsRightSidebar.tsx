/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Card,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text
} from "../../ui_primitives";

const SUPPORTED_FORMATS = [
  { label: "GGUF", primary: true },
  { label: "ONNX" },
  { label: "Safetensors" },
  { label: "PyTorch" },
  { label: "TensorRT" },
  { label: "MLX" }
];

const ModelsRightSidebar: React.FC = () => {
  const theme = useTheme();

  return (
    <FlexColumn
      sx={{
        width: 280,
        minWidth: 280,
        padding: "1.5rem 1rem 1.5rem 1rem",
        gap: "1rem",
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      {/* Supported Formats */}
      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: "var(--rounded-lg)",
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Text size="small" weight={600} sx={{ marginBottom: "0.75rem" }}>
          Supported Formats
        </Text>
        <FlexRow gap={0.5} sx={{ flexWrap: "wrap" }}>
          {SUPPORTED_FORMATS.map((fmt) => (
            <Chip
              key={fmt.label}
              label={fmt.label}
              compact
              variant={fmt.primary ? "filled" : "outlined"}
              color={fmt.primary ? "success" : "default"}
              sx={{
                fontSize: theme.fontSizeTiny,
                fontWeight: 500,
                height: 22,
                ...(fmt.primary
                  ? {
                      backgroundColor: `rgba(${theme.vars.palette.success.mainChannel} / 0.16)`,
                      color: theme.vars.palette.success.main,
                      borderColor: `rgba(${theme.vars.palette.success.mainChannel} / 0.4)`
                    }
                  : {
                      borderColor: theme.vars.palette.divider,
                      color: theme.vars.palette.text.secondary
                    })
              }}
            />
          ))}
        </FlexRow>
      </Card>

      {/* Need help? */}
      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: "var(--rounded-lg)",
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <FlexRow align="center" gap={1} sx={{ marginBottom: "0.5rem" }}>
          <HelpOutlineIcon
            sx={{ color: theme.vars.palette.primary.main, fontSize: 18 }}
          />
          <Text size="small" weight={600}>
            Need help?
          </Text>
        </FlexRow>
        <Caption sx={{ opacity: 0.6, lineHeight: 1.5, marginBottom: "0.75rem" }}>
          Learn how to add and run models locally.
        </Caption>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() =>
            window.open(
              "https://docs.nodetool.ai/models-and-providers",
              "_blank",
              "noopener,noreferrer"
            )
          }
        >
          View Documentation
        </EditorButton>
      </Card>
    </FlexColumn>
  );
};

export default memo(ModelsRightSidebar);
