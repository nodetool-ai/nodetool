/**
 * @jest-environment jsdom
 *
 * The image flow's footer carries two model pickers: a language model that
 * writes the brief, then an image model that draws it. UX study 3 saw all
 * three participants read the first one, captioned "Model", as the picture
 * model and search it for one. Each caption names its job.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

jest.mock("../../../properties/LanguageModelSelect", () => ({
  __esModule: true,
  default: () => <div>language picker</div>
}));
jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: () => <div>image picker</div>
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { BriefModelFooterField } from "../BriefModelSelect";
import { ImageModelFooterField, type LookStepControls } from "../LookStep";

const renderWithTheme = (node: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{node}</ThemeProvider>);

describe("image flow footer model captions", () => {
  it("captions the brief's language model as the brief model", () => {
    renderWithTheme(<BriefModelFooterField />);
    expect(screen.getByText("Brief model")).toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
  });

  it("captions the look step's picker as the image model", () => {
    const look = {
      availability: "ready",
      models: [],
      model: "model-1",
      provider: "prov",
      setModel: jest.fn()
    } as unknown as LookStepControls;
    renderWithTheme(<ImageModelFooterField look={look} />);
    expect(screen.getByText("Image model")).toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
  });
});
