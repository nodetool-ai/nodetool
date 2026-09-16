import { useState, type FC } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { CreativeContextFields } from "../CreativeContextFields";
import type { CreativeContext } from "../../../hooks/storyboard/productionContext";

const Harness: FC<{ onChange: jest.Mock }> = ({ onChange }) => {
  const [value, setValue] = useState<CreativeContext | undefined>();
  return (
    <CreativeContextFields
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

describe("CreativeContextFields", () => {
  it("returns optional product context and line-separated claims", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <Harness onChange={onChange} />
      </ThemeProvider>
    );

    await user.type(screen.getByLabelText("Product name"), "Harbor Clock");
    await user.type(
      screen.getByLabelText("Approved claims"),
      "Tide-powered{enter}Quiet at night"
    );

    expect(onChange).toHaveBeenLastCalledWith({
      schema_version: 1,
      product_name: "Harbor Clock",
      approved_claims: ["Tide-powered", "Quiet at night"]
    });
  });
});
