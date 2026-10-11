import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpc, trpcClient } from "../../trpc/client";
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
import { newDocumentId } from "../../lib/newDocumentId";
import {
  buildExampleSketch,
  EXAMPLE_SKETCHES,
  EXAMPLE_SKETCH_HEIGHT,
  EXAMPLE_SKETCH_WIDTH,
  exampleSketchUrl,
  type ExampleSketch
} from "../../utils/exampleSketches";
import { notifyMutationError } from "../../utils/notifyMutationError";

const DashboardExampleSketches = () => {
  const [category, setCategory] = useState("All");
  const examples = EXAMPLE_SKETCHES.filter(
    (example) => category === "All" || example.category === category
  );
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const utils = trpc.useUtils();
  const install = useMutation({
    retry: false,
    mutationFn: async (example: ExampleSketch) => {
      const projectId = creationProjectId();
      const document = await buildExampleSketch(example);
      const created = await trpcClient.sketch.create.mutate({
        id: newDocumentId(),
        name: example.name,
        projectId,
        backgroundColor: document.sketch.canvas.backgroundColor,
        width: EXAMPLE_SKETCH_WIDTH,
        height: EXAMPLE_SKETCH_HEIGHT
      });
      try {
        return await trpcClient.sketch.update.mutate({
          id: created.id,
          document
        });
      } catch (error) {
        await trpcClient.sketch.delete.mutate({ id: created.id });
        throw error;
      }
    },
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
    },
    onError: (error) => notifyMutationError("add the example sketch", error)
  });

  return (
    <FlexColumn
      component="section"
      aria-label="Example sketches"
      gap={SPACING.xl}
      sx={{ p: SPACING.xxl }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="big">Make a sketch your own</Text>
        <Text color="secondary">
          Sketch a campaign, plan a film, or explore a painted study. Each opens
          as your own editable copy with separate layers.
        </Text>
        <Caption>
          1200 × 900 · Five vector layers each · No model or API key needed
        </Caption>
      </FlexColumn>
      <TabGroup
        aria-label="Sketch categories"
        tabs={["All", "NodeTool", "Ads", "Movies", "Art studies"].map(
          (label) => ({ value: label, label })
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
              <Caption>{example.category}</Caption>
              <Text sx={TYPOGRAPHY.sans.label}>{example.name}</Text>
              <Caption color="secondary">{example.description}</Caption>
              <EditorButton
                disabled={install.isPending}
                aria-label={`Open ${example.name}`}
                aria-busy={
                  install.isPending && install.variables?.slug === example.slug
                }
                onClick={() => install.mutate(example)}
              >
                {install.isPending && install.variables?.slug === example.slug
                  ? "Opening sketch…"
                  : "Open sketch"}
              </EditorButton>
            </FlexColumn>
          </Card>
        ))}
      </AutoGrid>
    </FlexColumn>
  );
};

export default DashboardExampleSketches;
