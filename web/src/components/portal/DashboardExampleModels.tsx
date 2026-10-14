import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import { notifyMutationError } from "../../utils/notifyMutationError";
import { useAddExampleModelAsset } from "../../hooks/useAddExampleModelAsset";
import { NO_EXAMPLE_NEEDS } from "../../utils/exampleNeeds";
import ExampleNeedsPill from "./ExampleNeedsPill";

const DashboardExampleModels = () => {
  const [pack, setPack] = useState(EXAMPLE_MODEL_PACKS[0].slug);
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
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
    onError: (error) => notifyMutationError("add the example model", error)
  });
  const packLabel =
    EXAMPLE_MODEL_PACKS.find((entry) => entry.slug === pack)?.label ?? pack;

  return (
    <FlexColumn
      component="section"
      aria-label="Example 3D models"
      gap={SPACING.xl}
      sx={{ p: SPACING.xxl }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="big">Start from a 3D model</Text>
        <Text color="secondary">
          Open a low-poly game model in the 3D editor. Each opens as your own
          editable copy in the current project.
        </Text>
        <Caption>glTF 2.0 · Meters, +Y up · No model or API key needed</Caption>
      </FlexColumn>
      <TabGroup
        aria-label="Model packs"
        tabs={EXAMPLE_MODEL_PACKS.map(({ slug, label }) => ({
          value: slug,
          label
        }))}
        value={pack}
        onChange={setPack}
        size="small"
      />
      <Card padding="none" variant="outlined" sx={{ overflow: "hidden" }}>
        <ResponsiveImage
          locator={exampleModelOverviewUri(pack)}
          alt={`Every model in the ${packLabel} pack`}
          aspectRatio="16 / 9"
          fit="contain"
          loading="lazy"
        />
      </Card>
      {catalog.isPending ? (
        <FlexColumn align="center" padding={PADDING.spacious}>
          <LoadingSpinner size="medium" text="Loading models" />
        </FlexColumn>
      ) : catalog.isError ? (
        <EmptyState
          variant="error"
          title="Couldn't load models"
          description="Try again in a moment."
          actionText="Retry"
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
                    {model.triangles.toLocaleString()} triangles
                    {model.clips.length > 0
                      ? ` · ${model.clips.join(", ")}`
                      : ""}
                  </Caption>
                  <EditorButton
                    disabled={install.isPending}
                    aria-label={`Open ${model.name}`}
                    aria-busy={opening}
                    onClick={() => install.mutate(model)}
                    sx={{ alignSelf: "flex-start", mt: "auto" }}
                  >
                    {opening ? "Opening model…" : "Open model"}
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
