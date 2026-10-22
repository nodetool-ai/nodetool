import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import useOnboardingStore from "../../stores/OnboardingStore";
import {
  AutoGrid,
  Card,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  PADDING,
  ResponsiveImage,
  SPACING,
  TabGroup,
  Text,
  TYPOGRAPHY
} from "../ui_primitives";
import {
  EXAMPLE_MODEL_PACKS,
  exampleModelOverviewUri,
  exampleModelQueryKeys,
  fetchExampleModelCatalog,
  type ExampleModel
} from "../../utils/exampleModels";
import { useAddExampleModelAsset } from "../../hooks/useAddExampleModelAsset";
import { useNotificationStore } from "../../stores/NotificationStore";
import { NO_EXAMPLE_NEEDS } from "../../utils/exampleNeeds";
import ExampleNeedsPill from "./ExampleNeedsPill";

const DashboardExampleModels = () => {
  const { t } = useTranslation();
  const [pack, setPack] = useState(EXAMPLE_MODEL_PACKS[0].slug);
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const addExampleModelAsset = useAddExampleModelAsset();
  const catalog = useQuery({
    queryKey: exampleModelQueryKeys.catalog(pack),
    queryFn: () => fetchExampleModelCatalog(pack),
    staleTime: Infinity
  });
  const install = useMutation({
    retry: false,
    mutationFn: async (model: ExampleModel) => {
      const projectId = creationProjectId();
      const asset = await addExampleModelAsset(model, projectId);
      return { asset, projectId };
    },
    onSuccess: ({ asset, projectId }, model) => {
      openTab({
        type: "model3d",
        ref: asset.id,
        mode: "edit",
        title: asset.name || model.name,
        projectId
      });
      navigate("/workspace");
      useOnboardingStore.getState().markStep("keep-creating");
    },
    onError: (error) => {
      console.error("Failed to add the example model", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("pass3_16.portal.models.installError")
      });
    }
  });
  const packLabelKey =
    EXAMPLE_MODEL_PACKS.find((entry) => entry.slug === pack)?.slug ?? pack;

  return (
    <FlexColumn
      component="section"
      aria-label={t("pass3_16.portal.models.ariaLabel")}
      gap={SPACING.xl}
      sx={{ p: SPACING.xxl }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="big">{t("pass3_16.portal.models.title")}</Text>
        <Text color="secondary">{t("pass3_16.portal.models.description")}</Text>
        <Caption>{t("pass3_16.portal.models.technicalDetails")}</Caption>
      </FlexColumn>
      <TabGroup
        aria-label={t("pass3_16.portal.models.packTabsLabel")}
        tabs={EXAMPLE_MODEL_PACKS.map(({ slug, label }) => ({
          value: slug,
          label: t(`pass3_16.portal.models.packs.${slug}`, {
            defaultValue: label
          })
        }))}
        value={pack}
        onChange={setPack}
        size="small"
      />
      <Card padding="none" variant="outlined" sx={{ overflow: "hidden" }}>
        <ResponsiveImage
          locator={exampleModelOverviewUri(pack)}
          alt={t("pass3_16.portal.models.overviewAlt", {
            pack: t(`pass3_16.portal.models.packs.${packLabelKey}`, {
              defaultValue: packLabelKey
            })
          })}
          aspectRatio="16 / 9"
          fit="contain"
          loading="lazy"
        />
      </Card>
      {catalog.isPending ? (
        <FlexColumn align="center" padding={PADDING.spacious}>
          <LoadingSpinner
            size="medium"
            text={t("pass3_16.portal.models.loading")}
          />
        </FlexColumn>
      ) : catalog.isError ? (
        <EmptyState
          variant="error"
          title={t("pass3_16.portal.models.loadErrorTitle")}
          description={t("pass3_16.portal.models.loadErrorDescription")}
          actionText={t("pass3_16.portal.models.retry")}
          onAction={() => void catalog.refetch()}
        />
      ) : (
        <AutoGrid minItemWidth={240} gap={SPACING.xl}>
          {catalog.data.models.map((model) => {
            const opening =
              install.isPending && install.variables?.uri === model.uri;
            return (
              <Card key={model.uri} variant="outlined">
                <FlexColumn gap={SPACING.sm} sx={{ height: "100%" }}>
                  <Text sx={TYPOGRAPHY.sans.label}>{model.name}</Text>
                  <Caption color="secondary">{model.use}</Caption>
                  <ExampleNeedsPill needs={NO_EXAMPLE_NEEDS} />
                  <Caption>
                    {t("pass3_16.portal.models.triangleCount", {
                      count: model.triangles
                    })}
                    {model.clips.length > 0
                      ? ` · ${model.clips.join(", ")}`
                      : ""}
                  </Caption>
                  <EditorButton
                    disabled={install.isPending}
                    loading={opening}
                    aria-label={t("pass3_16.portal.models.openNamed", {
                      name: model.name
                    })}
                    aria-busy={opening}
                    onClick={() => install.mutate(model)}
                    sx={{ alignSelf: "flex-start", mt: "auto" }}
                  >
                    {opening
                      ? t("pass3_16.portal.models.opening")
                      : t("pass3_16.portal.models.open")}
                  </EditorButton>
                </FlexColumn>
              </Card>
            );
          })}
        </AutoGrid>
      )}
    </FlexColumn>
  );
};

export default DashboardExampleModels;
