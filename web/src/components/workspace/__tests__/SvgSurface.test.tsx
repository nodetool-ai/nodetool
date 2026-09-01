import { installGlobal, stub } from "../../../test-utils/doubles";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";

// Monaco is stood in for by a textarea, so an edit is a real typed change.
jest.mock("../MonacoPane", () => ({
  __esModule: true,
  default: ({
    value,
    onChange
  }: {
    value: string;
    onChange?: (next: string) => void;
  }) => (
    <textarea
      data-testid="monaco"
      aria-label="svg source"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}));

const update = jest.fn().mockResolvedValue({});
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { update: unknown }) => T) =>
    selector({ update })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(selector: (s: { addNotification: unknown }) => T) =>
    selector({ addNotification: jest.fn() })
}));

const asset: Asset = stub<Asset>({
  id: "svg-1",
  name: "logo.svg",
  content_type: "image/svg+xml",
  get_url: "http://localhost/logo.svg"
});

jest.mock("../../../serverState/useAssetById", () => ({
  useAssetById: () => ({ data: asset, isLoading: false, error: null })
}));

import SvgSurface from "../SvgSurface";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';

const renderSurface = (mode: "view" | "edit") => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <SvgSurface refId="svg-1" mode={mode} active />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe("SvgSurface", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({ ok: true, text: async () => SVG })
    );
  });

  it("paints the vector in view mode", async () => {
    const { container } = renderSurface("view");
    await waitFor(() =>
      expect(container.querySelector("svg rect")).not.toBeNull()
    );
    expect(screen.queryByTestId("monaco")).toBeNull();
  });

  it("shows the source beside a live preview in edit mode", async () => {
    const { container } = renderSurface("edit");
    expect(await screen.findByTestId("monaco")).toHaveValue(SVG);
    expect(container.querySelector("svg rect")).not.toBeNull();
  });

  it("previews the edited markup before it is saved", async () => {
    const { container } = renderSurface("edit");
    const source = await screen.findByTestId("monaco");

    await userEvent.clear(source);
    await userEvent.paste(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>'
    );

    await waitFor(() =>
      expect(container.querySelector("svg circle")).not.toBeNull()
    );
    expect(container.querySelector("svg rect")).toBeNull();
    // Nothing was written: the preview reflects the buffer, not the asset.
    expect(update).not.toHaveBeenCalled();
  });

  it("saves the edited markup back to the asset", async () => {
    renderSurface("edit");
    const source = await screen.findByTestId("monaco");

    await userEvent.clear(source);
    await userEvent.paste("<svg><circle r=\"2\"/></svg>");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        id: "svg-1",
        data: "<svg><circle r=\"2\"/></svg>",
        content_type: "image/svg+xml"
      })
    );
  });

  it("does not run script in markup it paints", async () => {
    installGlobal(
      "fetch",
      jest.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script>' +
          '<rect onload="1" width="4" height="4"/></svg>'
      })
    );
    const { container } = renderSurface("view");
    await waitFor(() =>
      expect(container.querySelector("svg rect")).not.toBeNull()
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onload]")).toBeNull();
  });
});
