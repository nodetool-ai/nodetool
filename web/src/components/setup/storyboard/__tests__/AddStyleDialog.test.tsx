import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { AddStyleDialog } from "../AddStyleDialog";
import { IMAGE_INPUT_TOKENS } from "../../generationEstimate";

// The descriptor call sends every reference as an image, so the estimate
// above the button prices them as input, the way the image flow does.
it("prices each reference image the call sends", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider theme={mockTheme}>
      <AddStyleDialog
        open
        saving={false}
        error={null}
        model={{ id: "gpt-4o-mini", provider: "openai", name: "GPT-4o mini" }}
        onClose={jest.fn()}
        onSubmit={jest.fn(async () => true)}
      />
    </ThemeProvider>
  );
  const base = 3000;

  expect(
    await screen.findByText(
      new RegExp(`about ${(base + IMAGE_INPUT_TOKENS).toLocaleString()} input`)
    )
  ).toBeInTheDocument();

  await user.upload(screen.getByLabelText("Reference images"), [
    new File(["a"], "a.png", { type: "image/png" }),
    new File(["b"], "b.png", { type: "image/png" })
  ]);

  expect(
    await screen.findByText(
      new RegExp(
        `about ${(base + 2 * IMAGE_INPUT_TOKENS).toLocaleString()} input`
      )
    )
  ).toBeInTheDocument();
});

it("offers Report on a failed style", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <AddStyleDialog
        open
        saving={false}
        error="The model did not describe these references."
        model={null}
        onClose={jest.fn()}
        onSubmit={jest.fn(async () => false)}
      />
    </ThemeProvider>
  );

  expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
});
