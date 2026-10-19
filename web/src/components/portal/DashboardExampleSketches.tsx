import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import { trpc } from "../../trpc/client";
import {
  AutoGrid,
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  ResponsiveImage,
  SPACING,
  TabGroup,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import {
  EXAMPLE_SKETCHES,
  exampleSketchUrl,
  type ExampleSketch
} from "../../utils/exampleSketches";
import { installExampleSketch } from "../../utils/installExampleSketch";
import { NO_EXAMPLE_NEEDS } from "../../utils/exampleNeeds";
import { useNotificationStore } from "../../stores/NotificationStore";
import ExampleNeedsPill from "./ExampleNeedsPill";

const sketchCategoryKey = (category: string): string => {
  if (category === "All") return "all";
  if (category === "Art studies") return "artStudies";
  return category.toLowerCase();
};

const DashboardExampleSketches = () => {
  const { t } = useTranslation();
  const [category, setCategory] = useState("All");
  const examples = EXAMPLE_SKETCHES.filter(
    (example) => category === "All" || example.category === category
  );
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const utils = trpc.useUtils();
  const install = useMutation({
    retry: false,
    mutationFn: (example: ExampleSketch) =>
      installExampleSketch(example, creationProjectId()),
    onSuccess: (created) => {
      utils.sketch.get.setData({ id: created.id }, created);
      void utils.sketch.list.invalidate();
      openTab({
        type: "sketch",
        ref: created.id,
        mode: "edit",
        title: created.name,
        projectId: created.projectId
      });
      navigate("/workspace");
      useOnboardingStore.getState().markStep("keep-creating");
    },
    onError: (error) => {
      console.error("Failed to add the example sketch", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("pass3_16.portal.sketches.installError")
      });
    }
  });

  return (
    <FlexColumn
      component="section"
      aria-label={t("pass3_16.portal.sketches.ariaLabel")}
      gap={SPACING.xl}
      sx={{ p: SPACING.xxl }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="big">{t("pass3_16.portal.sketches.title")}</Text>
        <Text color="secondary">
          {t("pass3_16.portal.sketches.description")}
        </Text>
        <Caption>{t("pass3_16.portal.sketches.technicalDetails")}</Caption>
      </FlexColumn>
      <TabGroup
        aria-label={t("pass3_16.portal.sketches.categoryTabsLabel")}
        tabs={["All", "NodeTool", "Ads", "Movies", "Art studies"].map(
          (categoryValue) => ({
            value: categoryValue,
            label: t(
              `pass3_16.portal.sketches.categories.${sketchCategoryKey(categoryValue)}`
            )
          })
        )}
        value={category}
        onChange={setCategory}
        size="small"
      />
      <AutoGrid minItemWidth={360} gap={SPACING.xl}>
        {examples.map((example) => (
          <Card
            key={example.slug}
            padding="none"
            variant="outlined"
            sx={{ overflow: "hidden" }}
          >
            <ResponsiveImage
              locator={exampleSketchUrl(example.slug, "preview")}
              alt={example.description}
              aspectRatio="4 / 3"
              loading="lazy"
              preferThumbnail
            />
            <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl }}>
              <Caption>
                {t(
                  `pass3_16.portal.sketches.categories.${sketchCategoryKey(example.category)}`
                )}
              </Caption>
              <Text sx={TYPOGRAPHY.sans.label}>{example.name}</Text>
              <Caption color="secondary">{example.description}</Caption>
              <ExampleNeedsPill needs={NO_EXAMPLE_NEEDS} />
              <EditorButton
                disabled={install.isPending}
                aria-label={t("pass3_16.portal.sketches.openNamed", {
                  name: example.name
                })}
                aria-busy={
                  install.isPending && install.variables?.slug === example.slug
                }
                onClick={() => install.mutate(example)}
              >
                {install.isPending && install.variables?.slug === example.slug
                  ? t("pass3_16.portal.sketches.opening")
                  : t("pass3_16.portal.sketches.open")}
              </EditorButton>
            </FlexColumn>
          </Card>
        ))}
      </AutoGrid>
    </FlexColumn>
  );
};

export default DashboardExampleSketches;
