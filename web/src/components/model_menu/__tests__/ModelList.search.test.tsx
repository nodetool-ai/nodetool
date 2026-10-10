import { render, screen } from "@testing-library/react";
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
  name: "Bark (small)",
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

const renderList = (searchTerm: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ModelList models={[bark]} onSelect={jest.fn()} searchTerm={searchTerm} />
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

describe("ModelList — search highlighting", () => {
  it.each(["bark (", "(small", "[x"])(
    "renders when the search term %s is not a valid pattern",
    (term) => {
      expect(() => renderList(term)).not.toThrow();
      expect(screen.getByText(/Bark/)).toBeInTheDocument();
    }
  );

  it("highlights a term that contains regex characters", () => {
    renderList("k (s");
    expect(screen.getByText("k (s")).toBeInTheDocument();
  });
});
