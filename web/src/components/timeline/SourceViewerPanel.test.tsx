import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SourceViewerPanel } from "./SourceViewerPanel";

const mockSetSourceRange = jest.fn((range) => {
  mockSourceRange = range;
});
let mockSourceRange: { inMs: number; outMs: number } | null = null;
const mockPerformSourceEdit = jest.fn((_kind: unknown, _context: unknown) => "clip-1");
const mockAsset = {
  id: "beach",
  name: "Beach scene",
  content_type: "video/mp4",
  duration: null
};

jest.mock("@mui/material/styles", () => ({ useTheme: () => ({ vars: { palette: { text: { primary: "#fff" }, c_scrim: "#000" } }, shape: { borderRadius: 4 } }) }));
jest.mock("../../stores/PanelStore", () => ({ usePanelStore: (selector: (state: unknown) => unknown) => selector({ panel: { activeView: "assets" } }) }));
jest.mock("../../stores/AssetGridStore", () => ({
  useAssetsSelectedAsset: () => mockAsset,
  useLibrarySelectedAsset: () => null
}));
jest.mock("../../stores/timeline/TimelineUIStore", () => ({
  useTimelineUIStore: (selector: (state: unknown) => unknown) => selector({ sourceRange: mockSourceRange, setSourceRange: mockSetSourceRange }),
  useTimelineUIStoreApi: () => ({ getState: () => ({ sourceRange: mockSourceRange, setSourceRange: mockSetSourceRange, selectClip: jest.fn() }) })
}));
jest.mock("../../stores/timeline/TimelineStore", () => ({ useTimelineStoreApi: () => ({ getState: () => ({}) }) }));
jest.mock("../../stores/timeline/TimelinePlaybackStore", () => ({ useTimelinePlaybackStoreApi: () => ({ getState: () => ({ currentTimeMs: 0 }) }) }));
jest.mock("../../stores/SettingsStore", () => ({ useSettingsStore: (selector: (state: unknown) => unknown) => selector({ settings: { timelineKeyboardPreset: "premiere" } }) }));
jest.mock("./dnd/assetToClipAdapter", () => ({ assetMediaType: () => "video" }));
jest.mock("./sourceEdit", () => ({
  performSourceEdit: (kind: unknown, context: unknown) => mockPerformSourceEdit(kind, context),
  sourceRangeFor: (asset: { duration: number | null }, range: { inMs: number; outMs: number } | null) => ({ inMs: range?.inMs ?? 1000, outMs: range?.outMs ?? (asset.duration ?? 5) * 1000 })
}));
jest.mock("../ui_primitives", () => ({
  AudioPlayback: () => null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  Caption: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  FlexColumn: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  FlexRow: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ResponsiveImage: () => null,
  ShortcutHint: () => null,
  Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TruncatedText: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  VideoPlayer: ({ onDurationChange }: { onDurationChange?: (duration: number) => void }) => <button aria-label="Video player" onClick={() => onDurationChange?.(5)}>Video</button>,
  SPACING: { md: 1, xs: 1, sm: 1 },
  getSpacingPx: () => "1px"
}));
jest.mock("./Inspector/InspectorPrimitives", () => ({
  InspectorPillInput: ({ ariaLabel, value, onCommit }: { ariaLabel: string; value: string; onCommit: (value: string) => void }) => <input aria-label={ariaLabel} defaultValue={value} onBlur={(event) => onCommit(event.currentTarget.value)} />,
  InspectorRow: ({ children }: React.PropsWithChildren) => <div>{children}</div>
}));
jest.mock("./Inspector/InspectorPrimitives.helpers", () => ({ parseSeconds: (value: string) => Math.round(Number(value) * 1000) }));
jest.mock("./timelineKeymap", () => ({ TIMELINE_KEYMAPS: { premiere: { sourceAppend: ["A"], sourceInsert: ["I"], sourceOverwrite: ["O"] } }, bindingKeys: () => "A" }));

describe("SourceViewerPanel", () => {
  beforeEach(() => {
    mockSourceRange = null;
    mockSetSourceRange.mockClear();
    mockPerformSourceEdit.mockClear();
  });

  it("passes entered seconds to Append as milliseconds", () => {
    mockSourceRange = { inMs: 1000, outMs: 5000 };
    const view = render(<SourceViewerPanel />);
    fireEvent.change(screen.getByLabelText("Source in point"), { target: { value: "1" } });
    fireEvent.blur(screen.getByLabelText("Source in point"));
    view.rerender(<SourceViewerPanel />);
    fireEvent.change(screen.getByLabelText("Source in point"), { target: { value: "1" } });
    fireEvent.blur(screen.getByLabelText("Source in point"));
    view.rerender(<SourceViewerPanel />);
    fireEvent.change(screen.getByLabelText("Source out point"), { target: { value: "2" } });
    fireEvent.blur(screen.getByLabelText("Source out point"));
    view.rerender(<SourceViewerPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Append" }));
    expect(mockPerformSourceEdit).toHaveBeenCalledWith("append", expect.objectContaining({ ui: expect.objectContaining({ sourceRange: { inMs: 1000, outMs: 2000 } }) }));
  });
});
