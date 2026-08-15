import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { useJsScriptStore } from "../../../stores/jsScript/JsScriptStore";
import JsScriptSettingsPanel from "../JsScriptSettingsPanel";

const ID = "js-settings";

beforeEach(() => {
  useJsScriptStore.setState({
    scripts: {},
    serverRevisions: {},
    saveStatus: {},
    lastRun: {},
    lastTest: {},
    running: {},
    history: {}
  });
  useJsScriptStore.getState().ensureScript(ID);
});

describe("JsScriptSettingsPanel", () => {
  it("has no packages picker — scripts import every installed pack", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <JsScriptSettingsPanel scriptId={ID} />
      </ThemeProvider>
    );

    expect(screen.queryByRole("combobox", { name: /packages/i })).toBeNull();
    expect(screen.getByLabelText(/timeout/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
  });
});
