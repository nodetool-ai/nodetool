import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import OpenRenderAsWorkflow from "../OpenRenderAsWorkflow";
import { useNotificationStore } from "../../../stores/NotificationStore";
const mockCreate = jest
  .fn()
  .mockResolvedValue({ id: "workflow", name: "Render" });
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (select: (state: unknown) => unknown) =>
    select({ createNew: mockCreate })
}));

it("explains why a legacy take cannot be reproduced", () => {
  const notify = jest.spyOn(useNotificationStore.getState(), "addNotification");
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenRenderAsWorkflow record={undefined} />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button"));
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ type: "warning" })
  );
  expect(mockCreate).not.toHaveBeenCalled();
});

it("creates a normal workflow from the recorded prompt", async () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <OpenRenderAsWorkflow
        record={{
          kind: "clip",
          model: "fake-video",
          aspect_ratio: "16:9",
          style_entity_id: null,
          recorded_at: "now",
          prompt_hash: "hash",
          generation: {
            mode: "video",
            provider: "fake",
            prompt: "Original shot action and look",
            params: {}
          }
        }}
      />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(mockCreate).toHaveBeenCalled());
  expect(mockCreate.mock.calls[0][1].graph.nodes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "prompt",
        data: expect.objectContaining({
          value: "Original shot action and look"
        })
      })
    ])
  );
});
