import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AudioSurface from "../AudioSurface";

const render = (ui: ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
    )
  });

jest.mock("../WorkspaceDocumentBar", () => ({
  __esModule: true,
  default: ({ tab }: { tab: { title: string } }) => (
    <div role="toolbar" aria-label={`${tab.title} document`} />
  )
}));
const tab = {
  id: "audio:audio-1",
  type: "audio" as const,
  ref: "audio-1",
  mode: "edit" as const,
  title: "Doc"
};
const mockAssetQuery = jest.fn();
jest.mock("../../../serverState/useAssetById", () => ({
  useAssetById: () => mockAssetQuery()
}));
jest.mock("../../audio_editor/AudioSampleEditor", () => ({
  __esModule: true,
  default: function AudioEditorDraft({
    active,
    serveAgentTools
  }: {
    active: boolean;
    serveAgentTools?: boolean;
  }) {
    const [draft, setDraft] = useState("original sample");
    return (
      <input
        aria-label="Audio draft"
        data-active={String(active)}
        data-agent={String(serveAgentTools)}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
}));
jest.mock("../AssetAgentPanel", () => ({
  __esModule: true,
  default: ({ type, assetId }: { type: string; assetId: string }) => (
    <div>{`${type} assistant for ${assetId}`}</div>
  )
}));
jest.mock("../../asset_viewer/AudioViewer", () => () => (
  <div>Audio viewer</div>
));
jest.mock("../DocumentLoadStatus", () => ({
  __esModule: true,
  default: ({ state, onRetry }: { state: string; onRetry: () => void }) => (
    <button onClick={onRetry}>{state}</button>
  )
}));

beforeEach(() =>
  mockAssetQuery.mockReturnValue({ data: { id: "audio-1" }, isPending: false })
);

it("keeps the same edited draft through inactive and View/Edit transitions", () => {
  const result = render(<AudioSurface tab={tab} refId="audio-1" mode="edit" active />);
  fireEvent.change(screen.getByLabelText("Audio draft"), {
    target: { value: "trimmed sample with undo history" }
  });
  result.rerender(<AudioSurface tab={tab} refId="audio-1" mode="edit" active={false} />);
  expect(screen.getByLabelText("Audio draft")).toHaveValue(
    "trimmed sample with undo history"
  );
  expect(screen.getByLabelText("Audio draft")).toHaveAttribute(
    "data-active",
    "false"
  );
  result.rerender(<AudioSurface tab={tab} refId="audio-1" mode="view" active />);
  result.rerender(<AudioSurface tab={tab} refId="audio-1" mode="edit" active />);
  expect(screen.getByLabelText("Audio draft")).toHaveValue(
    "trimmed sample with undo history"
  );
});

it("shows a settled metadata error and retries the query", () => {
  const refetch = jest.fn();
  mockAssetQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch
  });
  render(<AudioSurface tab={tab} refId="audio-1" mode="view" active />);
  fireEvent.click(screen.getByText("error"));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it("docks the assistant beside the editor and serves the agent tools", () => {
  render(<AudioSurface tab={tab} refId="audio-1" mode="edit" active />);
  expect(screen.getByText("audio assistant for audio-1")).toBeInTheDocument();
  expect(screen.getByLabelText("Audio draft")).toHaveAttribute(
    "data-agent",
    "true"
  );
});
