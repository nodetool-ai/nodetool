/** @jsxImportSource @emotion/react */
import { memo } from "react";
import { useTheme } from "@mui/material/styles";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import DataUsageOutlinedIcon from "@mui/icons-material/DataUsageOutlined";
import SavingsOutlinedIcon from "@mui/icons-material/SavingsOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import {
  Caption,
  Card,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS
} from "../ui_primitives";

interface CostPoint {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const COST_POINTS: CostPoint[] = [
  {
    icon: <DataUsageOutlinedIcon sx={{ fontSize: 18 }} />,
    title: "Chat is billed in tokens",
    body: "A token is roughly ¾ of a word. Providers charge for the tokens you send (your prompt) and the tokens the model writes back. A short chat costs a fraction of a cent; long documents cost more."
  },
  {
    icon: <ImageOutlinedIcon sx={{ fontSize: 18 }} />,
    title: "Images, audio, and video are billed per result",
    body: "Instead of tokens, these are usually priced per image, per second of audio or video, or per second of compute the model runs. A single image is typically a few cents."
  },
  {
    icon: <PaymentsOutlinedIcon sx={{ fontSize: 18 }} />,
    title: "You pay the provider, not NodeTool",
    body: "Your API key bills your own account with each provider directly. NodeTool never adds a markup and never sees your card — set spending limits in the provider's dashboard to stay in control."
  },
  {
    icon: <SavingsOutlinedIcon sx={{ fontSize: 18 }} />,
    title: "Start cheap or free",
    body: "Several providers give free credits or a free tier to experiment. Smaller and faster models cost much less than the largest ones — a great way to try things before scaling up."
  }
];

/**
 * Beginner-friendly explainer for how AI provider billing works — tokens,
 * per-result pricing, who gets charged, and how to start cheaply. Collapsed by
 * default so it doesn't crowd the connect actions but is one click away.
 */
const CostGuide: React.FC = () => {
  const theme = useTheme();

  return (
    <CollapsibleSection
      defaultOpen={false}
      title={
        <FlexRow align="center" gap={1}>
          <PaymentsOutlinedIcon
            sx={{ fontSize: 18, color: theme.vars.palette.primary.main }}
          />
          <Text size="small" weight={600}>
            How do costs work?
          </Text>
        </FlexRow>
      }
    >
      <FlexColumn gap={1.5} sx={{ mt: 1.5 }}>
        {COST_POINTS.map((point) => (
          <Card
            key={point.title}
            variant="outlined"
            padding="compact"
            sx={{
              borderRadius: BORDER_RADIUS.lg,
              border: `1px solid ${theme.vars.palette.divider}`,
              backgroundColor: theme.vars.palette.background.paper
            }}
          >
            <FlexRow align="flex-start" gap={1.5}>
              <FlexRow
                align="center"
                justify="center"
                sx={{
                  width: 34,
                  height: 34,
                  minWidth: 34,
                  borderRadius: BORDER_RADIUS.md,
                  color: theme.vars.palette.primary.main,
                  backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`
                }}
              >
                {point.icon}
              </FlexRow>
              <FlexColumn gap={0.25}>
                <Text size="small" weight={600}>
                  {point.title}
                </Text>
                <Caption sx={{ opacity: 0.7, lineHeight: 1.5 }}>
                  {point.body}
                </Caption>
              </FlexColumn>
            </FlexRow>
          </Card>
        ))}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export default memo(CostGuide);
