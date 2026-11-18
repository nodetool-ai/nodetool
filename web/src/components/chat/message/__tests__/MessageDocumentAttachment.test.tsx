import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MessageDocumentAttachment } from "../MessageDocumentAttachment";
import mockTheme from "../../../../__mocks__/themeMock";

// The factory hands the component the same module instance this suite
// imports below, so the pending-asset set it fills is the one the hook reads.
jest.mock("../../../../hooks/useResolvedMediaUri", () =>
  jest.requireActual("../../../../hooks/__mocks__/useResolvedMediaUri")
);
import {
  mockAssetUrl,
  mockPendingAsset,
  resetMockAssetContentTypes
} from "../../../../hooks/__mocks__/useResolvedMediaUri";

// "hello world": 11 bytes.
const PDF_DATA_URI = "data:application/pdf;base64,aGVsbG8gd29ybGQ=";
const ASSET_ID = "0123456789abcdef0123456789abcdef";

const renderAttachment = (
  document: Parameters<typeof MessageDocumentAttachment>[0]["document"]
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <MessageDocumentAttachment document={document} />
    </ThemeProvider>
  );

describe("MessageDocumentAttachment", () => {
  let openSpy: jest.SpyInstance;

  beforeEach(() => {
    openSpy = jest.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL = jest.fn(() => "blob:doc");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    openSpy.mockRestore();
    resetMockAssetContentTypes();
  });

  it("shows the file name, type and size", () => {
    renderAttachment({ type: "document", uri: PDF_DATA_URI, title: "Q3 report.pdf" });

    expect(screen.getByRole("button", { name: /Q3 report\.pdf/ })).toBeEnabled();
    expect(screen.getByText("PDF · 11 B")).toBeInTheDocument();
  });

  it("opens an inline file through a blob URL", async () => {
    const user = userEvent.setup();
    renderAttachment({ type: "document", uri: PDF_DATA_URI, title: "Q3 report.pdf" });

    await user.click(screen.getByRole("button", { name: /Q3 report\.pdf/ }));

    const blob = (URL.createObjectURL as jest.Mock).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(11);
    expect(openSpy).toHaveBeenCalledWith("blob:doc", "_blank", "noopener,noreferrer");
  });

  it("opens an asset at its resolved URL", async () => {
    const user = userEvent.setup();
    renderAttachment({ type: "document", uri: `asset://${ASSET_ID}.docx` });

    // No recorded name: the card falls back to the generic label.
    const card = screen.getByRole("button", { name: /Document/ });
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    await user.click(card);

    expect(openSpy).toHaveBeenCalledWith(
      mockAssetUrl(`${ASSET_ID}.docx`),
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("is disabled until the asset URL resolves", () => {
    mockPendingAsset("fedcba9876543210fedcba9876543210");
    renderAttachment({
      type: "document",
      uri: "asset://fedcba9876543210fedcba9876543210",
      title: "notes.pdf"
    });

    expect(screen.getByRole("button", { name: /notes\.pdf/ })).toBeDisabled();
  });
});
