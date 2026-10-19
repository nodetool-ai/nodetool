import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { I18nextProvider } from "react-i18next";
import mockTheme from "../../../__mocks__/themeMock";
import { createAppI18n } from "../../../i18n/i18n";
import ExampleNeedsPill from "../ExampleNeedsPill";

it.each([
  ["en", "Needs an image model"],
  ["de", "Bild-Modell erforderlich"],
  ["zh-CN", "需要图像模型"]
] as const)("renders the model requirement in %s", (locale, label) => {
  render(
    <ThemeProvider theme={mockTheme}>
      <I18nextProvider i18n={createAppI18n(locale)}>
        <ExampleNeedsPill
          needs={{ modelKinds: ["image_model"], requiredSettings: [] }}
        />
      </I18nextProvider>
    </ThemeProvider>
  );
  expect(screen.getByText(label)).toBeInTheDocument();
});
