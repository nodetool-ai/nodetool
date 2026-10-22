import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import mockTheme from "../../../__mocks__/themeMock";
import { GenerateReferenceDialog } from "../GenerateReferenceDialog";
import { useLastModelStore } from "../../../stores/lastModelStore";

const rpcRequest = jest.fn();

jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({
    value,
    task,
    onChange
  }: {
    value: string;
    task: string;
    onChange: (model: { id: string; provider: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ id: `${task}-model`, provider: "openai" })}
    >
      {value ? `Model ${value}` : `Select ${task} model`}
    </button>
  )
}));

const renderDialog = (
  props: Partial<React.ComponentProps<typeof GenerateReferenceDialog>> = {}
) => {
  const onPick = jest.fn();
  const onClose = jest.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={mockTheme}>
        <GenerateReferenceDialog
          open
          name="Mara"
          kind="character"
          descriptor="A courier in a red coat."
          onPick={onPick}
          onClose={onClose}
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
  return { onPick, onClose };
};

beforeEach(() => {
  rpcRequest.mockReset();
  localStorage.clear();
  useLastModelStore.setState({ byKind: {}, byTask: {} });
});

it("retakes a character sheet from the current picture so the look holds", async () => {
  const user = userEvent.setup();
  rpcRequest.mockResolvedValue({ asset_ids: ["sheet-1"] });
  const { onPick } = renderDialog({ currentAssetId: "current-1" });

  expect(
    screen.getByRole("switch", { name: /Keep the current look/ })
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Character sheet" }));
  await user.click(
    screen.getByRole("button", { name: "Select image_edit model" })
  );
  await user.click(screen.getByRole("button", { name: "Generate reference" }));

  await waitFor(() => expect(onPick).toHaveBeenCalledWith("sheet-1"));
  expect(rpcRequest).toHaveBeenCalledWith(
    "generate_media",
    expect.objectContaining({
      mode: "image_edit",
      model: "image_edit-model",
      source_asset_id: "current-1",
      aspect_ratio: "3:2",
      variations: 1,
      prompt: expect.stringContaining("character sheet")
    }),
    expect.any(Number),
    expect.any(AbortSignal)
  );
  expect(useLastModelStore.getState().byTask["image:image_edit"]?.model).toBe(
    "image_edit-model"
  );
});

it("draws from the prompt alone when the look is not kept", async () => {
  const user = userEvent.setup();
  rpcRequest.mockResolvedValue({ asset_ids: ["fresh-1"] });
  const { onPick } = renderDialog({ currentAssetId: "current-1" });

  await user.click(
    screen.getByRole("switch", { name: /Keep the current look/ })
  );
  await user.click(
    screen.getByRole("button", { name: "Select text_to_image model" })
  );
  await user.click(screen.getByRole("button", { name: "Generate reference" }));

  await waitFor(() => expect(onPick).toHaveBeenCalledWith("fresh-1"));
  const request = rpcRequest.mock.calls[0][1] as Record<string, unknown>;
  expect(request.mode).toBe("image");
  expect(request).not.toHaveProperty("source_asset_id");
});

it("offers several takes and uses the one the creator picks", async () => {
  const user = userEvent.setup();
  rpcRequest.mockResolvedValue({ asset_ids: ["take-1", "take-2"] });
  const { onPick } = renderDialog();

  expect(
    screen.queryByRole("switch", { name: /Keep the current look/ })
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Select text_to_image model" })
  );
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "Generate reference" }));

  const second = await screen.findByRole("button", { name: "Take 2" });
  expect(rpcRequest.mock.calls[0][1]).toEqual(
    expect.objectContaining({ variations: 2 })
  );
  expect(onPick).not.toHaveBeenCalled();
  await user.click(second);
  expect(second).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: "Use this take" }));
  expect(onPick).toHaveBeenCalledWith("take-2");
});
