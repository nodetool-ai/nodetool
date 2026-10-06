import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { WhisperServerProvider } from "../src/whisper-server-provider.js";

const url = process.env.WHISPER_CPP_TEST_SERVER_URL;
it.skipIf(!url)(
  "transcribes known speech through a running whisper-server",
  async () => {
    const provider = new WhisperServerProvider({ WHISPER_CPP_SERVER_URL: url });
    const audio = await readFile(
      new URL("./fixtures/jfk.wav", import.meta.url)
    );
    const result = await provider.automaticSpeechRecognition({
      model: "default",
      audio,
      language: "en",
      prompt: "inaugural speech",
      temperature: 0
    });
    expect(result.text.toLowerCase()).toContain("country");
    expect(result.chunks?.length).toBeGreaterThan(0);
    expect(result.chunks?.at(-1)?.timestamp[1]).toBeGreaterThan(5);
    expect(result.chunks?.at(-1)?.timestamp[1]).toBeLessThan(14);
  },
  120000
);
