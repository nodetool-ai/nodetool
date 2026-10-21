/**
 * @jest-environment jsdom
 */
import type { ComponentProps } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import type { Asset, Workflow } from "../../../stores/ApiTypes";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useAssetStore } from "../../../stores/AssetStore";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";
import { createAssetFile } from "../../../utils/createAssetFile";
import { trpcClient } from "../../../trpc/client";
import TransformWithWorkflowDialog, {
  TransformWithWorkflowView
} from "../TransformWithWorkflowDialog";
import type { TransformApplyAction } from "../transformWorkflow";

jest.mock("../../../trpc/client", () => ({
  trpcClient: { workflows: { list: { query: jest.fn() } } }
}));
jest.mock("../../../lib/workflow/runInlineGraphJob", () => ({
  runInlineGraphJob: jest.fn()
}));
jest.mock("../../../utils/createAssetFile", () => ({
  createAssetFile: jest.fn()
}));
jest.mock("../../../queryClient", () => ({
  queryClient: { invalidateQueries: jest.fn() }
}));
jest.mock("../../ui_primitives/MediaThumbnail", () => ({
  ...jest.requireActual("../../ui_primitives/MediaThumbnail"),
  MediaThumbnail: ({ alt }: { alt: string }) => <span>{`thumb:${alt}`}</span>
}));

const graphOf = (inputType: string, inputName: string) => ({
  nodes: [
    { id: "in", type: inputType, data: { name: inputName } },
    { id: "out", type: "nodetool.output.ImageOutput", data: { name: "result" } }
  ],
  edges: []
});

const workflows = [
  { id: "wf-upscale", name: "Upscale", description: null, graph: graphOf("nodetool.input.ImageInput", "image") },
  { id: "wf-recolor", name: "Recolor", description: "Shift the palette", graph: graphOf("nodetool.input.ImageInput", "photo") },
  { id: "wf-subs", name: "Subtitles", description: null, graph: graphOf("nodetool.input.VideoInput", "video") }
] as unknown as Workflow[];

const image = {
  id: "asset-1",
  name: "Miso.png",
  content_type: "image/png",
  parent_id: "folder-1",
  project_id: "project-1"
} as Asset;

type RunOptions = Parameters<typeof runInlineGraphJob>[0];

const renderDialog = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAssetGridStore.setState({ transformAsset: image });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <TransformWithWorkflowDialog />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const renderView = (
  props: Partial<ComponentProps<typeof TransformWithWorkflowView>> = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <TransformWithWorkflowView
          source={{ kind: "image", name: "Sketch", uri: "data:image/png;base64,AAAA" }}
          onClose={jest.fn()}
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("TransformWithWorkflowDialog", () => {
  let finishRun: (result: Awaited<ReturnType<typeof runInlineGraphJob>>) => void;
  let runOptions: RunOptions[];

  beforeEach(() => {
    runOptions = [];
    jest.mocked(trpcClient.workflows.list.query).mockResolvedValue({
      workflows,
      next: null
    } as never);
    jest.mocked(runInlineGraphJob).mockImplementation((options) => {
      runOptions.push(options);
      return new Promise((resolve) => {
        finishRun = resolve;
      });
    });
  });

  afterEach(() => {
    act(() => {
      useAssetGridStore.setState({ transformAsset: null });
    });
  });

  it("lists only workflows with an input of the asset's kind, searchable by name", async () => {
    renderDialog();

    expect(await screen.findByText("Upscale")).toBeInTheDocument();
    expect(screen.getByText("Recolor")).toBeInTheDocument();
    expect(screen.queryByText("Subtitles")).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search workflows by name"), "ups");
    await waitFor(() => expect(screen.queryByText("Recolor")).not.toBeInTheDocument());
    expect(screen.getByText("Upscale")).toBeInTheDocument();
  });

  it("runs the chosen workflow on the asset and shows its updates and outputs", async () => {
    renderDialog();

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(runOptions).toHaveLength(1);
    expect(runOptions[0]).toMatchObject({
      workflowId: "wf-upscale",
      params: { image: { type: "image", uri: "asset://asset-1", asset_id: "asset-1" } }
    });

    act(() => {
      runOptions[0].onMessage?.({
        type: "node_update",
        node_id: "in",
        node_name: "image",
        status: "running"
      });
    });
    expect(screen.getByText("Running image")).toBeInTheDocument();

    act(() => {
      runOptions[0].onMessage?.({
        type: "output_update",
        node_id: "out",
        node_name: "result",
        value: { type: "image", uri: "asset://out-1.png", asset_id: "out-1" }
      });
    });
    await act(async () => {
      finishRun({ success: true, outputs: {} });
    });

    expect(await screen.findByRole("button", { name: "Run again" })).toBeInTheDocument();
    expect(screen.getAllByTestId("transform-output")).toHaveLength(1);
    expect(screen.getByText("In assets")).toBeInTheDocument();
  });

  it("transforms an output again: saves it as an asset, then offers workflows for it", async () => {
    const created = { ...image, id: "saved-1", name: "result.png" };
    const createAsset = jest.fn().mockResolvedValue(created);
    useAssetStore.setState({ createAsset } as never);
    jest.mocked(createAssetFile).mockResolvedValue([
      { file: new File(["x"], "result.png", { type: "image/png" }), filename: "result.png", type: "image/png" }
    ]);
    renderDialog();

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() => {
      runOptions[0].onMessage?.({
        type: "output_update",
        node_id: "out",
        node_name: "result",
        value: { type: "image", uri: "/api/storage/u/tmp.png" }
      });
    });
    await act(async () => {
      finishRun({ success: true, outputs: {} });
    });

    await userEvent.click(screen.getByRole("button", { name: "Transform" }));

    // Saved next to the source asset, in its project.
    expect(createAsset).toHaveBeenCalledWith(
      expect.any(File),
      "wf-upscale",
      "folder-1",
      undefined,
      "file",
      "project-1"
    );
    expect(await screen.findByText("result.png")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Recolor"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(runOptions[1]).toMatchObject({
      workflowId: "wf-recolor",
      params: { photo: { type: "image", uri: "asset://saved-1", asset_id: "saved-1" } }
    });
  });

  it("runs an editor's media that has no asset as its data URI", async () => {
    renderView();

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(runOptions[0].params).toEqual({
      image: { type: "image", uri: "data:image/png;base64,AAAA" }
    });
  });

  it("hands a matching output back to the editor that opened it, then closes", async () => {
    const onApply = jest.fn<void, Parameters<TransformApplyAction["onApply"]>>();
    const onClose = jest.fn();
    renderView({
      onClose,
      apply: { label: "Add as layer", kinds: ["image"], onApply }
    });

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() => {
      runOptions[0].onMessage?.({
        type: "output_update",
        node_id: "out",
        node_name: "result",
        value: { type: "image", uri: "asset://out-1.png", asset_id: "out-1" }
      });
      runOptions[0].onMessage?.({
        type: "output_update",
        node_id: "clip",
        node_name: "clip",
        value: { type: "video", uri: "asset://out-2.mp4", asset_id: "out-2" }
      });
    });
    await act(async () => {
      finishRun({ success: true, outputs: {} });
    });

    // Only the image output offers the editor's action.
    expect(screen.getAllByRole("button", { name: "Add as layer" })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Add as layer" }));

    expect(onApply).toHaveBeenCalledWith({
      assetId: "out-1",
      kind: "image",
      name: "result",
      uri: "asset://out-1"
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the dialog open and says so when the editor cannot take the output", async () => {
    const onClose = jest.fn();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    renderView({
      onClose,
      apply: {
        label: "Add as layer",
        kinds: ["image"],
        onApply: () => Promise.reject(new Error("no editor"))
      }
    });

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    act(() => {
      runOptions[0].onMessage?.({
        type: "output_update",
        node_id: "out",
        node_name: "result",
        value: { type: "image", uri: "asset://out-1.png", asset_id: "out-1" }
      });
    });
    await act(async () => {
      finishRun({ success: true, outputs: {} });
    });
    await userEvent.click(screen.getByRole("button", { name: "Add as layer" }));

    expect(await screen.findByText("Could not use the output here.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels a live run when the dialog closes", async () => {
    renderDialog();

    await userEvent.click(await screen.findByText("Upscale"));
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    const signal = runOptions[0].signal!;
    await userEvent.click(screen.getByRole("button", { name: "Stop run" }));

    expect(signal.aborted).toBe(true);
  });
});
