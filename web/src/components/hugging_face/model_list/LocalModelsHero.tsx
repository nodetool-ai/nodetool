/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import ComputerIcon from "@mui/icons-material/Computer";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text
} from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";

const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i < 2 ? 0 : 1)} ${units[i]}`;
};

interface LocalModelsHeroProps {
  models: UnifiedModel[];
}

const LocalModelsHero: React.FC<LocalModelsHeroProps> = ({ models }) => {
  const theme = useTheme();

  const stats = useMemo(() => {
    const installed = models.filter((m) => m.downloaded);
    const totalBytes = installed.reduce(
      (sum, m) => sum + (m.size_on_disk || 0),
      0
    );
    return {
      count: installed.length,
      size: formatSize(totalBytes)
    };
  }, [models]);

  return (
    <Card
      variant="outlined"
      padding="comfortable"
      sx={{
        borderRadius: "var(--rounded-xl)",
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        marginBottom: "1.25rem"
      }}
    >
      <FlexRow gap={2} align="center" sx={{ flexWrap: "wrap" }}>
        {/* Icon + title */}
        <FlexRow align="center" gap={1.5} sx={{ minWidth: 0, flex: "1 1 320px" }}>
          <FlexRow
            align="center"
            justify="center"
            sx={{
              width: 44,
              height: 44,
              minWidth: 44,
              borderRadius: "var(--rounded-lg)",
              backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
              color: theme.vars.palette.primary.main
            }}
          >
            <ComputerIcon sx={{ fontSize: 22 }} />
          </FlexRow>
          <FlexColumn sx={{ minWidth: 0 }}>
            <Text size="normal" weight={600}>
              Local Models
            </Text>
            <Caption sx={{ opacity: 0.6, lineHeight: 1.4 }}>
              Run models locally for privacy, speed, and offline access.
            </Caption>
            <EditorButton
              density="compact"
              variant="text"
              size="small"
              endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
              onClick={() =>
                window.open(
                  "https://docs.nodetool.ai/models-and-providers",
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              sx={{
                alignSelf: "flex-start",
                marginTop: "2px",
                paddingLeft: 0,
                paddingRight: 0,
                fontSize: theme.fontSizeTiny
              }}
            >
              Learn more
            </EditorButton>
          </FlexColumn>
        </FlexRow>

        {/* Stats */}
        <FlexRow gap={3} align="center" sx={{ flexShrink: 0 }}>
          <Stat
            value={String(stats.count)}
            label="Models installed"
            icon={
              <Caption
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: `1.5px solid ${theme.vars.palette.success.main}`,
                  display: "inline-block"
                }}
              />
            }
          />
          <Stat
            value={stats.size}
            label="Storage used"
            icon={
              <StorageOutlinedIcon
                sx={{ fontSize: 14, color: theme.vars.palette.text.secondary }}
              />
            }
          />
          <Stat
            value="100%"
            label="Local & private"
            icon={
              <LockOutlinedIcon
                sx={{ fontSize: 14, color: theme.vars.palette.text.secondary }}
              />
            }
          />
        </FlexRow>

      </FlexRow>
    </Card>
  );
};

interface StatProps {
  value: string;
  label: string;
  icon: React.ReactNode;
}

const Stat: React.FC<StatProps> = ({ value, label, icon }) => {
  const theme = useTheme();
  return (
    <FlexColumn align="flex-start" sx={{ minWidth: 0 }}>
      <FlexRow align="center" gap={0.5}>
        <Text size="big" weight={600} sx={{ lineHeight: 1.1 }}>
          {value}
        </Text>
        {icon}
      </FlexRow>
      <Caption
        sx={{
          opacity: 0.55,
          fontSize: theme.fontSizeTiny,
          marginTop: "2px",
          whiteSpace: "nowrap"
        }}
      >
        {label}
      </Caption>
    </FlexColumn>
  );
};

export default memo(LocalModelsHero);
