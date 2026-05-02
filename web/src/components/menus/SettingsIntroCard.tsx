/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text
} from "../ui_primitives";

interface SettingsIntroCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Optional bullet-style highlights shown to the right of the description. */
  highlights?: { label: string; value?: string }[];
  docsUrl?: string;
  docsLabel?: string;
}

const SettingsIntroCard: React.FC<SettingsIntroCardProps> = ({
  icon,
  title,
  description,
  highlights,
  docsUrl,
  docsLabel = "Learn more"
}) => {
  const theme = useTheme();

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
            {icon}
          </FlexRow>
          <FlexColumn sx={{ minWidth: 0 }}>
            <Text size="normal" weight={600}>
              {title}
            </Text>
            <Caption sx={{ opacity: 0.6, lineHeight: 1.4 }}>
              {description}
            </Caption>
            {docsUrl && (
              <EditorButton
                density="compact"
                variant="text"
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                onClick={() =>
                  window.open(docsUrl, "_blank", "noopener,noreferrer")
                }
                sx={{
                  alignSelf: "flex-start",
                  marginTop: "2px",
                  paddingLeft: 0,
                  paddingRight: 0,
                  fontSize: theme.fontSizeTiny
                }}
              >
                {docsLabel}
              </EditorButton>
            )}
          </FlexColumn>
        </FlexRow>

        {highlights && highlights.length > 0 && (
          <FlexRow gap={3} align="center" sx={{ flexShrink: 0, flexWrap: "wrap" }}>
            {highlights.map((h) => (
              <FlexColumn key={h.label} align="flex-start">
                {h.value && (
                  <Text size="big" weight={600} sx={{ lineHeight: 1.1 }}>
                    {h.value}
                  </Text>
                )}
                <Caption
                  sx={{
                    opacity: 0.55,
                    fontSize: theme.fontSizeTiny,
                    marginTop: "2px",
                    whiteSpace: "nowrap"
                  }}
                >
                  {h.label}
                </Caption>
              </FlexColumn>
            ))}
          </FlexRow>
        )}
      </FlexRow>
    </Card>
  );
};

export default memo(SettingsIntroCard);
