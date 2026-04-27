import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentSettingsPanel } from "../ToolSettingsPanels";
import { DEFAULT_SEGMENT_SETTINGS } from "../types";
import type { SamModelInfo } from "../sam";
import { LOCAL_SAM3_CAPABILITIES } from "../sam";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";

const baseLocalSam3Info: SamModelInfo = {
  status: "not-installed",
  backendId: "local-sam3",
  backendLabel: "Local SAM3",
  capabilities: LOCAL_SAM3_CAPABILITIES,
  nodeType: "huggingface.image_segmentation.MaskGeneration",
  modelId: "facebook/sam3",
  modelName: "Local SAM3",
  errorMessage: "Local SAM3 is not ready"
};

describe("SegmentSettingsPanel", () => {
  const originalStartDownload = useModelDownloadStore.getState().startDownload;
  const originalCancelDownload = useModelDownloadStore.getState().cancelDownload;

  beforeEach(() => {
    useModelDownloadStore.setState({
      downloads: {},
      startDownload: originalStartDownload,
      cancelDownload: originalCancelDownload
    });
  });

  it("shows only automatic mode for the Local SAM3 backend", () => {
    render(
      <SegmentSettingsPanel
        settings={{
          ...DEFAULT_SEGMENT_SETTINGS,
          backend: "local-sam3",
          promptMode: "auto"
        }}
        onChange={jest.fn()}
        segmentationStatus="idle"
        modelInfo={baseLocalSam3Info}
        onRunSegmentation={jest.fn()}
        onApplyResult={jest.fn()}
        onDiscardResult={jest.fn()}
        onCancelSegmentation={jest.fn()}
        onClearPrompts={jest.fn()}
        onCheckModel={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "Point" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Box" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto" })).toBeInTheDocument();
    expect(
      screen.getByText("Local SAM3 currently supports automatic layer split only.")
    ).toBeInTheDocument();
  });

  it("shows the node-pack hint when Local SAM3 metadata is unavailable", () => {
    render(
      <SegmentSettingsPanel
        settings={{
          ...DEFAULT_SEGMENT_SETTINGS,
          backend: "local-sam3",
          promptMode: "auto"
        }}
        onChange={jest.fn()}
        segmentationStatus="idle"
        modelInfo={{
          ...baseLocalSam3Info,
          errorMessage: "Install or enable the HuggingFace node pack"
        }}
        onRunSegmentation={jest.fn()}
        onApplyResult={jest.fn()}
        onDiscardResult={jest.fn()}
        onCancelSegmentation={jest.fn()}
        onClearPrompts={jest.fn()}
        onCheckModel={jest.fn()}
      />
    );

    expect(
      screen.getByText("Install or enable the HuggingFace node pack")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download Local SAM3" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segment" })).toBeDisabled();
  });

  it("shows a Local SAM3 download action when the model is missing", async () => {
    const user = userEvent.setup();
    const startDownload = jest.fn();
    useModelDownloadStore.setState({ startDownload });

    render(
      <SegmentSettingsPanel
        settings={{
          ...DEFAULT_SEGMENT_SETTINGS,
          backend: "local-sam3",
          promptMode: "auto"
        }}
        onChange={jest.fn()}
        segmentationStatus="idle"
        modelInfo={baseLocalSam3Info}
        onRunSegmentation={jest.fn()}
        onApplyResult={jest.fn()}
        onDiscardResult={jest.fn()}
        onCancelSegmentation={jest.fn()}
        onClearPrompts={jest.fn()}
        onCheckModel={jest.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Download Local SAM3" }));

    expect(startDownload).toHaveBeenCalledWith("facebook/sam3", "hf.model");
  });

  it("shows the Local SAM3 downloading hint from existing NodeTool download state", () => {
    useModelDownloadStore.setState({
      downloads: {
        "facebook/sam3": {
          id: "facebook/sam3",
          status: "running",
          downloadedBytes: 50,
          totalBytes: 100,
          speed: null,
          speedHistory: []
        }
      }
    });

    render(
      <SegmentSettingsPanel
        settings={{
          ...DEFAULT_SEGMENT_SETTINGS,
          backend: "local-sam3",
          promptMode: "auto"
        }}
        onChange={jest.fn()}
        segmentationStatus="idle"
        modelInfo={{
          ...baseLocalSam3Info,
          status: "downloading",
          downloadProgress: 0.5
        }}
        onRunSegmentation={jest.fn()}
        onApplyResult={jest.fn()}
        onDiscardResult={jest.fn()}
        onCancelSegmentation={jest.fn()}
        onClearPrompts={jest.fn()}
        onCheckModel={jest.fn()}
      />
    );

    expect(screen.getByText(/Local SAM3 is downloading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Segment" })).toBeDisabled();
  });

  it("shows a cancel action while Local SAM3 is downloading", async () => {
    const user = userEvent.setup();
    const cancelDownload = jest.fn().mockResolvedValue(undefined);
    useModelDownloadStore.setState({
      cancelDownload,
      downloads: {
        "facebook/sam3": {
          id: "facebook/sam3",
          status: "running",
          downloadedBytes: 50,
          totalBytes: 100,
          speed: null,
          speedHistory: []
        }
      }
    });

    render(
      <SegmentSettingsPanel
        settings={{
          ...DEFAULT_SEGMENT_SETTINGS,
          backend: "local-sam3",
          promptMode: "auto"
        }}
        onChange={jest.fn()}
        segmentationStatus="idle"
        modelInfo={{
          ...baseLocalSam3Info,
          status: "downloading",
          downloadProgress: 0.5
        }}
        onRunSegmentation={jest.fn()}
        onApplyResult={jest.fn()}
        onDiscardResult={jest.fn()}
        onCancelSegmentation={jest.fn()}
        onClearPrompts={jest.fn()}
        onCheckModel={jest.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel download" }));

    expect(cancelDownload).toHaveBeenCalledWith("facebook/sam3");
  });
});
