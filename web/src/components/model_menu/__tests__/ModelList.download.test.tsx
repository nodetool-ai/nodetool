import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ModelList from "../ModelList";
import type { ModelSelectorModel } from "../../../utils/modelNormalization";
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

const renderList = (onModelDownload?: (m: ModelSelectorModel) => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ModelList
        models={[bark]}
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

beforeEach(() => {
  useModelDownloadStore.setState({ downloads: {} });
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
});
