import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import ModelList from "../ModelList";
import type { ModelRowBadge } from "../ModelList";
import type { ModelSelectorModel } from "../../../utils/modelNormalization";

jest.mock("../../../hooks/useModelAvailability", () => ({
  useModelAvailability: () => () => ({
    available: true,
    providerEnabled: true,
    hasKey: true
  })
}));

const freeModel = {
  type: "language_model",
  id: "meta-llama/llama-3.3-70b-instruct:free",
  name: "Llama 3.3 70B (free)",
  provider: "openrouter"
} as ModelSelectorModel;

const paidModel = {
  type: "language_model",
  id: "meta-llama/llama-3.3-70b-instruct",
  name: "Llama 3.3 70B",
  provider: "openrouter"
} as ModelSelectorModel;

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

describe("ModelList — row badge", () => {
  it("shows the badge only on the rows it returns one for", () => {
    const rowBadge = (m: ModelSelectorModel): ModelRowBadge | null =>
      m.id.endsWith(":free")
        ? { label: "Free tier", tooltip: "Rate limited", color: "warning" }
        : null;
    render(
      <ThemeProvider theme={mockTheme}>
        <ModelList
          models={[freeModel, paidModel]}
          onSelect={jest.fn()}
          rowBadge={rowBadge}
        />
      </ThemeProvider>
    );
    expect(screen.getAllByText("Free tier")).toHaveLength(1);
    expect(screen.getByLabelText("Free tier: Rate limited")).toBeInTheDocument();
  });
});
