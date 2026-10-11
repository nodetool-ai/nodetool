/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import CreativeContextFields from "../CreativeContextFields";

jest.mock("../../../../hooks/useResolvedMediaUri");
jest.mock("../../../entities/EntityAssetPickerDialog", () => ({
  __esModule: true,
  default: () => null
}));

describe("CreativeContextFields", () => {
  it("keeps typed text when the step leaves without a blur", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { unmount } = render(
      <ThemeProvider theme={mockTheme}>
        <CreativeContextFields value={undefined} onChange={onChange} />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Creative context (optional)"));
    await user.type(
      screen.getByRole("textbox", { name: "Product name" }),
      "Paper boat"
    );
    expect(onChange).not.toHaveBeenCalled();

    unmount();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ product_name: "Paper boat" })
    );
  });

  it("leaves an untouched field out of the context on blur", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <CreativeContextFields value={undefined} onChange={onChange} />
      </ThemeProvider>
    );

    await user.click(screen.getByText("Creative context (optional)"));
    await user.click(screen.getByRole("textbox", { name: "Product name" }));
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  // V7: a draft over the limits blocks the step while it is typed, so Cmd+Enter
  // cannot carry the step past a draft that would then be dropped.
  it("reports an invalid draft before it is committed", async () => {
    const user = userEvent.setup();
    const onValidationChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <CreativeContextFields
          value={undefined}
          onChange={jest.fn()}
          onValidationChange={onValidationChange}
        />
      </ThemeProvider>
    );
    await user.click(screen.getByText("Creative context (optional)"));
    fireEvent.change(screen.getByRole("textbox", { name: "Approved claims" }), {
      target: { value: TOO_MANY_CLAIMS }
    });

    expect(onValidationChange).toHaveBeenLastCalledWith(
      expect.stringContaining("at most 64 claims")
    );
  });

  // V7: reopening the section shows the stored value again, so the invalid
  // draft it replaced no longer blocks the step.
  it("clears the error when the field remounts from the stored value", async () => {
    const user = userEvent.setup();
    const onValidationChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <CreativeContextFields
          value={undefined}
          onChange={jest.fn()}
          onValidationChange={onValidationChange}
        />
      </ThemeProvider>
    );
    const title = screen.getByText("Creative context (optional)");
    await user.click(title);
    const claims = screen.getByRole("textbox", { name: "Approved claims" });
    fireEvent.change(claims, { target: { value: TOO_MANY_CLAIMS } });
    fireEvent.blur(claims);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(title);
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Approved claims" })
      ).not.toBeInTheDocument()
    );
    await user.click(title);
    await screen.findByRole("textbox", { name: "Approved claims" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onValidationChange).toHaveBeenLastCalledWith(undefined);
  });

  it("blocks every edit when read-only but still opens and closes", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <CreativeContextFields
          readOnly
          value={{
            schema_version: 1,
            product_name: "Paper boat",
            reference_bindings: [{ kind: "product", asset_id: "a1" }]
          }}
          onChange={onChange}
        />
      </ThemeProvider>
    );
    const title = screen.getByText("Creative context (optional)");
    await user.click(title);
    const name = screen.getByRole("textbox", { name: "Product name" });
    expect(name).toHaveAttribute("readonly");
    fireEvent.change(name, { target: { value: "Steel hull" } });
    fireEvent.blur(name);
    expect(name).toHaveValue("Paper boat");
    for (const kind of ["product", "character", "style"]) {
      expect(
        screen.getByRole("button", { name: `Add ${kind} reference` })
      ).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "Remove reference 1" })
    ).toBeDisabled();

    await user.click(title);
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Product name" })
      ).not.toBeInTheDocument()
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

const TOO_MANY_CLAIMS = Array.from(
  { length: 65 },
  (_, index) => `Claim ${index + 1}`
).join("\n");
