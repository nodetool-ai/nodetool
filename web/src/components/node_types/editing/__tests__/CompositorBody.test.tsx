/**
 * Tests for CompositorBody utilities and LayerRow interactions.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderHook, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@emotion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../../__mocks__/themeMock";

import {
  sortImageKeys,
  nextImageIndex,
  useImageUrl,
  useImageUrls
} from "../CompositorBody.helpers";
import { LayerRow, type LayerRowProps } from "../LayerRow";

const mockGetAsset = jest.fn();
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (state: { get: typeof mockGetAsset }) => unknown) =>
    selector({ get: mockGetAsset })
}));

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: () => ({
    setProperties: jest.fn(),
    setPropertyComplete: jest.fn()
  })
}));

jest.mock("../../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: () => ({
    handleAddProperty: jest.fn(),
    handleDeleteProperty: jest.fn()
  })
}));

jest.mock("../../../inputs/NumberInput", () => {
  return function MockNumberInput(props: {
    value: number;
    onChange: (_e: null, v: number) => void;
    onChangeComplete?: () => void;
  }) {
    return (
      <input
        type="number"
        data-testid="mock-number-input"
        value={props.value}
        onChange={(e) => props.onChange(null, Number(e.target.value))}
        onBlur={() => props.onChangeComplete?.()}
      />
    );
  };
});

const WithTheme: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
);

describe("sortImageKeys", () => {
  it("sorts image_N keys by numeric suffix", () => {
    expect(sortImageKeys(["image_2", "image_0", "image_10", "image_1"])).toEqual([
      "image_0",
      "image_1",
      "image_2",
      "image_10"
    ]);
  });

  it("ignores non-matching keys", () => {
    expect(sortImageKeys(["foo", "image_1", "bar", "image_0"])).toEqual([
      "image_0",
      "image_1"
    ]);
  });

  it("returns empty array for no matches", () => {
    expect(sortImageKeys(["foo", "bar"])).toEqual([]);
  });
});

describe("nextImageIndex", () => {
  it("returns 0 for empty keys", () => {
    expect(nextImageIndex([])).toBe(0);
  });

  it("returns max + 1 for contiguous keys", () => {
    expect(nextImageIndex(["image_0", "image_1", "image_2"])).toBe(3);
  });

  it("returns max + 1 with gaps", () => {
    expect(nextImageIndex(["image_0", "image_2"])).toBe(3);
  });

  it("ignores non-matching keys", () => {
    expect(nextImageIndex(["foo", "image_5", "bar"])).toBe(6);
  });
});

const makeQueryWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const QueryWrapper: React.FC<{ children: React.ReactNode }> = ({
    children
  }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return QueryWrapper;
};

const renderImageHook = <T,>(hook: () => T) =>
  renderHook(hook, { wrapper: makeQueryWrapper() });

describe("useImageUrl", () => {
  it("returns uri when present", () => {
    const { result } = renderImageHook(() =>
      useImageUrl({ uri: "https://example.com/img.png" })
    );
    expect(result.current).toBe("https://example.com/img.png");
  });

  it("returns undefined for undefined input", () => {
    const { result } = renderImageHook(() => useImageUrl(undefined));
    expect(result.current).toBeUndefined();
  });

  it("returns base64 data URI for string data", () => {
    const { result } = renderImageHook(() => useImageUrl({ data: "aGVsbG8=" }));
    expect(result.current).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("passes through already-formatted URLs in data", () => {
    const dataUri = "data:image/png;base64,abc";
    const { result } = renderImageHook(() => useImageUrl({ data: dataUri }));
    expect(result.current).toBe(dataUri);

    const blobUri = "blob:http://localhost/xyz";
    const { result: r2 } = renderImageHook(() => useImageUrl({ data: blobUri }));
    expect(r2.current).toBe(blobUri);
  });

  it("converts Uint8Array to a base64 data URI", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { result } = renderImageHook(() => useImageUrl({ data: bytes }));
    expect(result.current).toBeTruthy();
    expect(result.current?.startsWith("data:image/png;base64,")).toBe(true);
  });

  // An `asset://` locator fetches nowhere; the editor and thumbnails rendered
  // blank because the raw locator was handed to <img> and fetch().
  it("resolves an asset:// locator through the asset's get_url", async () => {
    mockGetAsset.mockResolvedValue({
      id: "a1",
      get_url: "https://storage.example.com/a1.png"
    });
    const { result } = renderImageHook(() =>
      useImageUrl({ uri: "asset://a1.png" })
    );
    expect(result.current).toBeUndefined();
    await waitFor(() =>
      expect(result.current).toBe("https://storage.example.com/a1.png")
    );
    expect(mockGetAsset).toHaveBeenCalledWith("a1");
  });

  it("prefers inline data over an asset:// locator", () => {
    const { result } = renderImageHook(() =>
      useImageUrl({ uri: "asset://a2", data: "aGVsbG8=" })
    );
    expect(result.current).toBe("data:image/png;base64,aGVsbG8=");
  });
});

describe("useImageUrls", () => {
  it("returns the same array while the URLs are unchanged", () => {
    const { result, rerender } = renderImageHook(() =>
      useImageUrls([{ uri: "https://example.com/a.png" }, undefined])
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first).toEqual(["https://example.com/a.png", undefined]);
  });
});

describe("LayerRow", () => {
  const baseProps: LayerRowProps = {
    index: 0,
    propertyKey: "image_0",
    state: { opacity: 1, blend_mode: "normal", visible: true },
    onOpacityChange: jest.fn(),
    onOpacityComplete: jest.fn(),
    onBlendChange: jest.fn(),
    onToggleVisible: jest.fn(),
    onDelete: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders with a placeholder when no image is provided", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} />
      </WithTheme>
    );
    expect(screen.getByLabelText("Layer 1 thumbnail")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} />
      </WithTheme>
    );
    const deleteBtn = screen.getByRole("button", { name: "Delete layer" });
    fireEvent.click(deleteBtn);
    expect(baseProps.onDelete).toHaveBeenCalledWith(0);
  });

  it("calls onToggleVisible when visibility button is clicked", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} />
      </WithTheme>
    );
    const visBtn = screen.getByRole("button", { name: "Hide layer" });
    fireEvent.click(visBtn);
    expect(baseProps.onToggleVisible).toHaveBeenCalledWith(0);
  });

  it("shows 'Show layer' label when hidden", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} state={{ ...baseProps.state, visible: false }} />
      </WithTheme>
    );
    expect(screen.getByRole("button", { name: "Show layer" })).toBeInTheDocument();
  });

  it("calls onBlendChange when blend mode is changed", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} />
      </WithTheme>
    );
    const select = screen.getByRole("combobox");
    fireEvent.mouseDown(select);
    const option = screen.getByText("Multiply");
    fireEvent.click(option);
    expect(baseProps.onBlendChange).toHaveBeenCalledWith(0, "multiply");
  });

  it("shows the thumbnail when an image URL is given", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} imageUrl="https://example.com/t.png" />
      </WithTheme>
    );
    const thumb = screen.getByLabelText("Layer 1 thumbnail");
    expect(thumb.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/t.png"
    );
  });

  it("calls onOpacityChange when opacity input changes", () => {
    render(
      <WithTheme>
        <LayerRow {...baseProps} />
      </WithTheme>
    );
    const input = screen.getByTestId("mock-number-input");
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(baseProps.onOpacityChange).toHaveBeenCalledWith(0, 0.5);
  });
});
