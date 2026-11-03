import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import LipsyncStudio from "../LipsyncStudio";
import { useLipsyncStudioStore } from "../../../stores/LipsyncStudioStore";
import useMediaGenerationStore from "../../../stores/MediaGenerationStore";
import { useLastModelStore } from "../../../stores/lastModelStore";
jest.mock("../../effects/EffectSourcePicker", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../entities/EntityPickerDialog", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../chat/composer/ModeChips", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../chat/composer/useModeProviderSetup", () => ({
  useModeProviderSetup: () => ({ needsSetup: false })
}));
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({
    models: [{ id: "video", provider: "fake" }]
  }),
  useTTSModelsByProvider: () => ({
    models: [{ id: "speech", provider: "fake" }]
  })
}));
it("blocks rendering until the real person's consent is confirmed", () => {
  useLipsyncStudioStore.setState({
    sourceAssetId: "image",
    text: "Hello",
    status: "idle",
    realPerson: true,
    confirmed: false
  });
  useMediaGenerationStore.getState().setAudioParams({
    model: {
      type: "tts_model",
      id: "speech",
      provider: "fake",
      name: "Speech",
      voices: ["alloy"],
      selected_voice: "alloy"
    },
    voice: "alloy"
  });
  useLastModelStore.setState({
    byTask: { "video:audio_to_video": { model: "video", provider: "fake" } },
    byKind: { video: { model: "video", provider: "fake" } }
  });
  render(
    <ThemeProvider theme={mockTheme}>
      <LipsyncStudio />
    </ThemeProvider>
  );
  expect(screen.getByRole("button", { name: "Render lipsync" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I have this person's consent/ })
  );
  expect(screen.getByRole("button", { name: "Render lipsync" })).toBeEnabled();
});
