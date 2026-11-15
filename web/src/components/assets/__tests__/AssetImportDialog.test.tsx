/**
 * The import dialog on the desktop app: Copy or Link, with Link chosen up
 * front when a file reaches the server's size threshold.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AssetImportDialog from "../AssetImportDialog";

const THRESHOLD = 1024;

const fileOf = (name: string, size: number): File => {
  const file = new File(["x"], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

const renderDialog = (files: File[]) => {
  const onImport = jest.fn();
  const onCancel = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetImportDialog
        request={{ files, thresholdBytes: THRESHOLD }}
        onImport={onImport}
        onCancel={onCancel}
      />
    </ThemeProvider>
  );
  return { onImport, onCancel };
};

describe("AssetImportDialog", () => {
  it("offers Copy and Link and defaults to Link for a file at the threshold", async () => {
    const { onImport } = renderDialog([fileOf("long take.mp4", THRESHOLD)]);

    expect(
      screen.getByRole("radio", { name: "Copy into the project folder" })
    ).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Link in place" })).toBeChecked();
    expect(screen.getByText("long take.mp4")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(onImport).toHaveBeenCalledWith("link");
  });

  it("defaults to Copy for files below the threshold", async () => {
    const { onImport } = renderDialog([fileOf("still.mp4", THRESHOLD - 1)]);

    expect(
      screen.getByRole("radio", { name: "Copy into the project folder" })
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(onImport).toHaveBeenCalledWith("copy");
  });

  it("imports with the choice the creator made", async () => {
    const { onImport } = renderDialog([fileOf("long take.mp4", THRESHOLD * 2)]);

    await userEvent.click(
      screen.getByRole("radio", { name: "Copy into the project folder" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(onImport).toHaveBeenCalledWith("copy");
  });

  it("imports nothing on Cancel", async () => {
    const { onImport, onCancel } = renderDialog([fileOf("clip.mp4", 1)]);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("renders nothing without a request", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <AssetImportDialog request={null} onImport={jest.fn()} onCancel={jest.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
