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
  AutoGrid,
  BORDER_RADIUS,
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
import { openExamplesTab } from "../workspace/openPageTab";
import imageStill from "../../assets/guided-flows/image.webp";
import videoStill from "../../assets/guided-flows/video.webp";
import appStill from "../../assets/guided-flows/script.webp";
import workflowStill from "../../assets/guided-flows/workflow.webp";

const CARD_MIN_WIDTH = 240;
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
    <FlexColumn
      component="section"
      aria-label={t("pass3_32.projects.home.exploreExamples.heading")}
      gap={GAP.comfortable}
    >
      <FlexRow align="flex-end" gap={GAP.normal}>
        <FlexColumn gap={GAP.tight} sx={{ flex: 1, minWidth: 0 }}>
          <Text size="big" component="h2">
            {t("pass3_32.projects.home.exploreExamples.heading")}
          </Text>
          <Caption color="secondary">
            {t("pass3_32.projects.home.exploreExamples.intro")}
          </Caption>
        </FlexColumn>
        <EditorButton
          variant="text"
          density="compact"
          endIcon={<ArrowForwardIcon />}
          onClick={() => openExamplesTab()}
        >
          {t("pass3_32.projects.home.exploreExamples.viewAll")}
        </EditorButton>
      </FlexRow>
      <AutoGrid
        role="group"
        aria-label={t("pass3_32.projects.home.exploreExamples.heading")}
        minItemWidth={CARD_MIN_WIDTH}
        fill="fit"
        gap={GAP.comfortable}
        sx={{
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
      </AutoGrid>
    </FlexColumn>
  );
};

export default memo(ExploreExamples);
