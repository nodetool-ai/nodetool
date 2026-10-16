import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ModelList from "../ModelList";
import {
  modelRowKey,
  type ModelSelectorModel
} from "../../../utils/modelNormalization";
import { useModelDownloadStore } from "../../../stores/ModelDownloadStore";

jest.mock("../../../hooks/useModelAvailability", () => ({
  useModelAvailability: () => () => ({
    available: false,
    providerEnabled: true,
    hasKey: true
  })
}));

const bark = {
  type: "tts_model",
  id: "suno/bark",
  name: "Bark",
  provider: "huggingface-local",
  execution: {
    kind: "server",
    state: "download_required",
    label: "Server",
    execution_site: "nodetool_host"
  },
  adapter: {
    state: "installed",
    artifact_ref: { source: "huggingface", repo_id: "suno/bark" }
  }
} as unknown as ModelSelectorModel;

const zImage = {
  ...bark,
  id: "z-image-turbo",
  name: "Z-Image Turbo",
  provider: "stable_diffusion_cpp",
  adapter: {
    state: "installed",
    artifact_ref: { source: "huggingface", repo_id: "acme/diffusion" },
    extra_artifact_refs: [{ source: "huggingface", repo_id: "acme/encoder" }]
  }
} as unknown as ModelSelectorModel;

const renderList = (
  onModelDownload?: (m: ModelSelectorModel) => void,
  model: ModelSelectorModel = bark
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ModelList
        models={[model]}
        onSelect={jest.fn()}
        onModelDownload={onModelDownload}
      />
    </ThemeProvider>
  );

// jsdom has no layout: give elements a size so the virtualizer renders rows.
const originalSize = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
};

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: { configurable: true, value: 400 },
    offsetHeight: { configurable: true, value: 400 }
  });
});

afterAll(() => {
  for (const [key, descriptor] of Object.entries(originalSize)) {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    }
  }
});

const progress = (id: string, status: string) => ({
  id,
  status,
  downloadedBytes: 1,
  totalBytes: 2,
  totalFiles: 1,
  downloadedFiles: 0,
  currentFiles: []
});

beforeEach(() => {
  useModelDownloadStore.setState({ downloads: {}, requestedModels: {} });
});

describe("ModelList — models that need their files", () => {
  it("offers a Download button that starts the model's download", async () => {
    const onModelDownload = jest.fn();
    renderList(onModelDownload);

    await userEvent.click(screen.getByRole("button", { name: /^Download suno\/bark/ }));

    expect(onModelDownload).toHaveBeenCalledWith(bark);
  });

  it("shows the status badge when the picker cannot download", () => {
    renderList();
    expect(
      screen.queryByRole("button", { name: /^Download suno\/bark/ })
    ).not.toBeInTheDocument();
  });

  it("names every repository of a model that loads files from several", async () => {
    renderList(jest.fn(), zImage);
    expect(
      screen.getByRole("button", { name: /^Download acme\/diffusion and 1 more repository/ })
    ).toBeInTheDocument();
  });

  it("keeps showing progress while any of the model's repositories downloads", () => {
    useModelDownloadStore.setState({
      downloads: { "acme/encoder": progress("acme/encoder", "progress") } as never,
      requestedModels: { [modelRowKey(zImage)]: true }
    });
    renderList(jest.fn(), zImage);
    expect(screen.queryByRole("button", { name: /^Download/ })).not.toBeInTheDocument();
  });

  it("ignores a shared repository that another model downloaded", () => {
    // Another row's click fetched the encoder this model also loads.
    useModelDownloadStore.setState({
      downloads: { "acme/encoder": progress("acme/encoder", "completed") } as never,
      requestedModels: { "stable_diffusion_cpp:other-model": true }
    });
    renderList(jest.fn(), zImage);
    expect(screen.getByRole("button", { name: /^Download acme\/diffusion/ })).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });
});
