import { act, render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import TranslationProvider from "../TranslationProvider";
import { useSettingsStore } from "../../stores/SettingsStore";

function TranslatedLabel() {
  const { t } = useTranslation();
  return <span>{t("common.save")}</span>;
}

afterEach(() => {
  act(() => useSettingsStore.getState().resetSettings());
  localStorage.clear();
});

it("switches mounted consumers and document language and persists the choice", () => {
  render(<TranslationProvider><TranslatedLabel /></TranslationProvider>);
  expect(screen.getByText("Save")).toBeTruthy();
  act(() => useSettingsStore.getState().updateSettings({ locale: "zh-CN" }));
  expect(screen.getByText("保存")).toBeTruthy();
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(JSON.parse(localStorage.getItem("settings-storage") ?? "{}").state.settings.locale).toBe("zh-CN");
  act(() => useSettingsStore.getState().resetSettings());
  expect(screen.getByText("Save")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
});

it("provides initialized English translations to tests without a provider", () => {
  render(<TranslatedLabel />);
  expect(screen.getByText("Save")).toBeTruthy();
});

it.each([{}, { locale: "invalid" }, { locale: "zh-CN" }])(
  "rehydrates old and validated locale settings: %p",
  async (settings) => {
    localStorage.setItem("settings-storage", JSON.stringify({ state: { settings }, version: 0 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().settings.locale).toBe(
      "locale" in settings && settings.locale === "zh-CN" ? "zh-CN" : "en"
    );
  }
);
