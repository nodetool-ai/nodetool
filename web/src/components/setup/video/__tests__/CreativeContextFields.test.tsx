/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
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
});
