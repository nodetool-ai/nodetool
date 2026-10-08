import React, { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { CreativeContext } from "@nodetool-ai/protocol";
import mockTheme from "../../../../__mocks__/themeMock";
import { ScriptCreativeContextFields } from "../ScriptCreativeContextFields";

const Host = ({
  onChange
}: {
  onChange: (value: CreativeContext | undefined) => void;
}) => {
  const [value, setValue] = useState<CreativeContext | undefined>();
  return (
    <ScriptCreativeContextFields
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
};

const renderFields = () => {
  const onChange = jest.fn();
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <Host onChange={onChange} />
    </ThemeProvider>
  );
  return { onChange, unmount: view.unmount };
};

describe("ScriptCreativeContextFields claims", () => {
  it("keeps spaces and new lines while typing and commits the list on blur", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFields();
    const field = screen.getByRole("textbox", { name: "Approved claims" });
    await user.type(field, "Ships in two days{enter}Made in Ohio");
    expect(field).toHaveValue("Ships in two days\nMade in Ohio");
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      approved_claims: ["Ships in two days", "Made in Ohio"]
    });
  });

  it("commits a typed draft when the field unmounts without a blur", async () => {
    const user = userEvent.setup();
    const { onChange, unmount } = renderFields();
    await user.type(
      screen.getByRole("textbox", { name: "Prohibited claims" }),
      "Cures colds"
    );
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      prohibited_claims: ["Cures colds"]
    });
  });
});
