import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  makeTestRuntime,
  INPUT_KEY,
  OUTPUT_KEY,
  TEST_SCOPE
} from "../../__tests__/testRuntime";
import { TextInputWidget } from "../widgets";
import { compileCameraPresets } from "@nodetool-ai/presets";
import { presetCatalog } from "../../../../lib/presets/catalog";

jest.mock("../../../../hooks/useResolvedMediaUri");

const outputFields = (fields: string[]): Partial<AppInstanceState> => ({
  outputs: {
    [OUTPUT_KEY]: {
      value: fields,
      invocationId: "read",
      status: "done",
      revision: 1
    }
  }
});

const renderInput = (
  value = "",
  fields: string[] = ["title", "color", "image_url"],
  cameraPresets = false
) => {
  const runtime = makeTestRuntime({
    inputs: { [INPUT_KEY]: { value, dirty: true, revision: 1 } },
    ...outputFields(fields)
  });
  const Wrapper = runtime.wrapper;
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <TextInputWidget
          id="prompt"
          binding="prompt"
          label="Prompt template"
          multiline
          placeholderFieldsBinding="result"
          cameraPresets={cameraPresets}
        />
      </Wrapper>
    </ThemeProvider>
  );
  return runtime;
};

it("shows a button for each catalog field and inserts at the cursor", async () => {
  const runtime = renderInput("Animate  slowly.");
  const input = screen.getByRole("textbox", { name: "Prompt template" });
  expect(
    screen.getByRole("button", { name: "Insert {{image_url}}" })
  ).toBeInTheDocument();
  await userEvent.click(input);
  if (!(input instanceof HTMLTextAreaElement))
    throw new Error("Expected a textarea");
  input.setSelectionRange(8, 8);
  await userEvent.click(
    screen.getByRole("button", { name: "Insert {{title}}" })
  );
  expect(input).toHaveValue("Animate {{title}} slowly.");
  expect(runtime.store.getState().inputs[INPUT_KEY]?.value).toBe(
    "Animate {{title}} slowly."
  );
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(17);
});

it("replaces selected text and allows continued typing", async () => {
  renderInput("Animate this product.");
  const input = screen.getByRole("textbox", { name: "Prompt template" });
  await userEvent.click(input);
  if (!(input instanceof HTMLTextAreaElement))
    throw new Error("Expected a textarea");
  input.setSelectionRange(8, 20);
  await userEvent.click(
    screen.getByRole("button", { name: "Insert {{color}}" })
  );
  await userEvent.keyboard(" beautifully");
  expect(input).toHaveValue("Animate {{color}} beautifully.");
});

it("updates the available buttons when a different catalog is read without losing the prompt", () => {
  const runtime = renderInput("Keep this prompt", []);
  expect(
    screen.queryByRole("button", { name: /Insert/ })
  ).not.toBeInTheDocument();
  act(() => runtime.store.setState(outputFields(["sku", "material"])));
  expect(
    screen.getByRole("button", { name: "Insert {{material}}" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Insert {{title}}" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Prompt template" })).toHaveValue(
    "Keep this prompt"
  );
});

it("allows keyboard activation of a placeholder button", async () => {
  renderInput("", ["sku"]);
  const button = screen.getByRole("button", { name: "Insert {{sku}}" });
  await userEvent.tab();
  await userEvent.tab();
  expect(button).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("textbox", { name: "Prompt template" })).toHaveValue(
    "{{sku}}"
  );
});

it("keeps typing at the cursor when the selected text already matches the placeholder", async () => {
  renderInput("{{title}}", ["title"]);
  const input = screen.getByRole("textbox", { name: "Prompt template" });
  await userEvent.click(input);
  if (!(input instanceof HTMLTextAreaElement))
    throw new Error("Expected a textarea");
  input.setSelectionRange(0, 9);
  await userEvent.click(
    screen.getByRole("button", { name: "Insert {{title}}" })
  );
  await userEvent.keyboard(" product");
  expect(input).toHaveValue("{{title}} product");
});

it("writes placeholders into the shared prompt variable used by test and batch runs", async () => {
  const runtime = makeTestRuntime(
    { variables: { promptTemplate: "" }, ...outputFields(["title"]) },
    {
      scope: {
        ...TEST_SCOPE,
        variables: [
          {
            id: "promptTemplate",
            name: "Prompt template",
            scope: "user",
            persist: true
          }
        ]
      }
    }
  );
  const Wrapper = runtime.wrapper;
  render(
    <ThemeProvider theme={mockTheme}>
      <Wrapper>
        <TextInputWidget
          id="prompt"
          binding="var:promptTemplate"
          label="Prompt template"
          multiline
          placeholderFieldsBinding="result"
        />
      </Wrapper>
    </ThemeProvider>
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Insert {{title}}" })
  );
  expect(runtime.store.getState().variables.promptTemplate).toBe("{{title}}");
});

it("replaces selected camera direction with a preset and preserves CSV placeholders", async () => {
  const preset = presetCatalog
    .filter({ kind: "camera", mode: "image_to_video" })
    .find((item) => item.slot === "move");
  if (!preset) throw new Error("No camera movement preset is available");
  const clause = compileCameraPresets([preset.id], {
    catalog: presetCatalog,
    mode: "image_to_video",
    modelId: ""
  })?.clause;
  renderInput("{{title}}. Old camera direction", ["title"], true);
  const input = screen.getByRole("textbox", { name: "Prompt template" });
  await userEvent.click(input);
  if (!(input instanceof HTMLTextAreaElement))
    throw new Error("Expected a textarea");
  input.setSelectionRange(11, input.value.length);
  await userEvent.click(screen.getByRole("button", { name: "Camera presets" }));
  expect(
    screen.getByRole("button", { name: "Insert camera direction" })
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("option", { name: preset.name }));
  await userEvent.click(
    screen.getByRole("button", { name: "Insert camera direction" })
  );
  expect(input).toHaveValue(`{{title}}. ${clause}`);
  expect(input).toHaveFocus();
});

it("cancels the camera picker without changing the prompt", async () => {
  renderInput("{{title}} keeps its original camera move.", [], true);
  await userEvent.click(screen.getByRole("button", { name: "Camera presets" }));
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(await screen.findByRole("textbox", { name: "Prompt template" })).toHaveValue(
    "{{title}} keeps its original camera move."
  );
});
