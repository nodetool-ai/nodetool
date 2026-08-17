import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { DEFAULT_OPERATION_ID } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime } from "../../__tests__/testRuntime";
import { ModelSelectWidget } from "../WorkflowInputWidget";

// The real selects open a model dialog backed by the models API; the widget's
// job is only to hand the chosen model to the runtime, so each select is stood
// in for by a button that reports one.
jest.mock("../../../properties/LanguageModelSelect", () => {
  const react = jest.requireActual("react");
  const model = {
    type: "language_model",
    id: "gpt-5.4-mini",
    provider: "openai",
    name: "gpt-5.4-mini"
  };
  return {
    __esModule: true,
    default: ({ value, onChange }: { value: string; onChange: (v: unknown) => void }) =>
      react.createElement(
        "button",
        { type: "button", onClick: () => onChange(model) },
        `language_model:${value || "none"}`
      )
  };
});

jest.mock("../../../properties/ImageModelSelect", () => {
  const react = jest.requireActual("react");
  const model = {
    type: "image_model",
    id: "flux-schnell",
    provider: "fal_ai",
    name: "flux-schnell"
  };
  return {
    __esModule: true,
    default: ({ value, onChange }: { value: string; onChange: (v: unknown) => void }) =>
      react.createElement(
        "button",
        { type: "button", onClick: () => onChange(model) },
        `image_model:${value || "none"}`
      )
  };
});

const MODEL_PROPERTY_BINDING = `op:${DEFAULT_OPERATION_ID}/prop:n5#model`;

const renderWidget = (props: {
  binding?: string;
  modelKind?: string;
  label?: string;
}) => {
  const runtime = makeTestRuntime();
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <ModelSelectWidget id="m1" {...props} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  return runtime;
};

describe("ModelSelectWidget", () => {
  it("writes the picked language model to the bound node property", async () => {
    const user = userEvent.setup();
    const runtime = renderWidget({ binding: MODEL_PROPERTY_BINDING });

    await user.click(screen.getByRole("button", { name: "language_model:none" }));

    expect(
      runtime.store.getState().inputs[`${DEFAULT_OPERATION_ID}:n5#model`].value
    ).toEqual({
      type: "language_model",
      id: "gpt-5.4-mini",
      provider: "openai",
      name: "gpt-5.4-mini"
    });
  });

  it("renders the select for the chosen model kind", () => {
    renderWidget({ binding: MODEL_PROPERTY_BINDING, modelKind: "image_model" });
    expect(
      screen.getByRole("button", { name: "image_model:none" })
    ).toBeInTheDocument();
  });

  it("holds its value locally when nothing is bound", async () => {
    const user = userEvent.setup();
    const runtime = renderWidget({});

    await user.click(screen.getByRole("button", { name: "language_model:none" }));

    expect(runtime.store.getState().view["m1:value"]).toEqual(
      expect.objectContaining({ id: "gpt-5.4-mini" })
    );
  });
});
