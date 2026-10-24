/**
 * The start page's "Explore examples" row: one card per kind of example, each
 * opening the Examples page on that kind. The examples themselves live on the
 * page, which has the room to show and install them.
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import type { ExampleTab } from "../../stores/ExamplesPageStore";
import { SetupCardButton } from "../setup/SetupCardButton";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  ResponsiveImage,
  SHADOW,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import StartSection, { START_CARD_GRID_SX } from "./StartSection";
import { openExamplesTab } from "../workspace/openPageTab";
import imageStill from "../../assets/guided-flows/image.webp";
import videoStill from "../../assets/guided-flows/video.webp";
import appStill from "../../assets/guided-flows/script.webp";
import workflowStill from "../../assets/guided-flows/workflow.webp";

const THUMB_WIDTH = 88;
const THUMB_HEIGHT = 64;
const EXAMPLE_CARD_CLASS = "start-example-card";

interface ExampleKind {
  key: "images" | "videos" | "apps" | "workflows";
  tab: ExampleTab;
  still: string;
}

const EXAMPLE_KINDS: readonly ExampleKind[] = [
  { key: "images", tab: "sketches", still: imageStill },
  { key: "videos", tab: "timelines", still: videoStill },
  { key: "apps", tab: "apps", still: appStill },
  { key: "workflows", tab: "workflows", still: workflowStill }
];

const ExploreExamples = () => {
  const { t } = useTranslation();
  return (
    <StartSection
      title={t("pass3_32.projects.home.exploreExamples.heading")}
      subtitle={t("pass3_32.projects.home.exploreExamples.intro")}
      action={
        <EditorButton
          variant="text"
          density="compact"
          endIcon={<ArrowForwardIcon />}
          onClick={() => openExamplesTab()}
        >
          {t("pass3_32.projects.home.exploreExamples.viewAll")}
        </EditorButton>
      }
    >
      <Box
        role="group"
        aria-label={t("pass3_32.projects.home.exploreExamples.heading")}
        sx={{
          ...START_CARD_GRID_SX,
          [`& .${EXAMPLE_CARD_CLASS}`]: {
            borderRadius: BORDER_RADIUS.lg,
            boxShadow: (theme) => SHADOW(theme).sm
          }
        }}
      >
        {EXAMPLE_KINDS.map((kind) => (
          <SetupCardButton
            key={kind.key}
            role="navigation"
            className={EXAMPLE_CARD_CLASS}
            padding={PADDING.comfortable}
            onSelect={() => openExamplesTab(kind.tab)}
          >
            <FlexRow align="center" gap={GAP.comfortable}>
              <ResponsiveImage
                locator={kind.still}
                alt=""
                fit="cover"
                borderRadius={BORDER_RADIUS.md}
                sx={{ width: THUMB_WIDTH, height: THUMB_HEIGHT, flexShrink: 0 }}
              />
              <FlexColumn gap={GAP.micro} sx={{ minWidth: 0 }}>
                <Text component="span" sx={TYPOGRAPHY.sans.label}>
                  {t(`pass3_32.projects.home.exploreExamples.${kind.key}.title`)}
                </Text>
                <Caption component="span" color="secondary">
                  {t(
                    `pass3_32.projects.home.exploreExamples.${kind.key}.description`
                  )}
                </Caption>
              </FlexColumn>
            </FlexRow>
          </SetupCardButton>
        ))}
      </Box>
    </StartSection>
  );
};

export default memo(ExploreExamples);
