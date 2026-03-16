import { vi, describe, it, expect, beforeEach } from "vitest";
import { getNodeMetadata } from "@nodetool/node-sdk";

vi.mock("../../src/nodes/kie-base.js", () => ({
  getApiKey: vi.fn(() => "test-api-key"),
  kieExecuteTask: vi.fn(async () => ({
    data: "YXVkaW9kYXRh",
    taskId: "task_789",
  })),
  kieExecuteSunoTask: vi.fn(async () => ({
    data: "c3Vub2RhdGE=",
    taskId: "suno_123",
  })),
  uploadAudioInput: vi.fn(
    async () => "https://uploaded.example.com/audio.mp3"
  ),
  uploadImageInput: vi.fn(
    async () => "https://uploaded.example.com/image.png"
  ),
  isRefSet: vi.fn((ref: unknown) => {
    if (!ref || typeof ref !== "object") return false;
    const r = ref as Record<string, unknown>;
    return !!(r.data || r.uri);
  }),
}));

import {
  GenerateMusicNode,
  ExtendMusicNode,
  CoverAudioNode,
  AddInstrumentalNode,
  AddVocalsNode,
  ReplaceMusicSectionNode,
  ElevenLabsTextToSpeechNode,
  ElevenLabsAudioIsolationNode,
  ElevenLabsSoundEffectNode,
  ElevenLabsSpeechToTextNode,
  ElevenLabsV3DialogueNode,
  KIE_AUDIO_NODES,
} from "../../src/nodes/kie-audio.js";

import {
  getApiKey,
  kieExecuteTask,
  kieExecuteSunoTask,
  uploadAudioInput,
  isRefSet,
} from "../../src/nodes/kie-base.js";

// Helper: standard secrets input
const secrets = { _secrets: { KIE_API_KEY: "test-api-key" } };
const audioRef = { uri: "file:///test/audio.mp3", data: "audio-data" };

function metadataDefaults(NodeCls: any) {
  const metadata = getNodeMetadata(NodeCls);
  return Object.fromEntries(
    metadata.properties
      .filter((prop) => Object.prototype.hasOwnProperty.call(prop, "default"))
      .map((prop) => [prop.name, prop.default])
  );
}

function expectMetadataDefaults(NodeCls: any) {
  expect(new NodeCls().serialize()).toEqual(metadataDefaults(NodeCls));
}


beforeEach(() => {
  vi.clearAllMocks();
});

// ─── KIE_AUDIO_NODES export ──────────────────────────────────────────────────

describe("KIE_AUDIO_NODES export", () => {
  it("contains all 11 audio node classes", () => {
    expect(KIE_AUDIO_NODES).toHaveLength(11);
  });

  it("contains the correct classes in order", () => {
    expect(KIE_AUDIO_NODES).toEqual([
      GenerateMusicNode,
      ExtendMusicNode,
      CoverAudioNode,
      AddInstrumentalNode,
      AddVocalsNode,
      ReplaceMusicSectionNode,
      ElevenLabsTextToSpeechNode,
      ElevenLabsAudioIsolationNode,
      ElevenLabsSoundEffectNode,
      ElevenLabsSpeechToTextNode,
      ElevenLabsV3DialogueNode,
    ]);
  });
});

// ─── GenerateMusicNode ───────────────────────────────────────────────────────

describe("GenerateMusicNode", () => {
  it("has correct nodeType", () => {
    expect(GenerateMusicNode.nodeType).toBe("kie.audio.GenerateMusic");
  });

  it("has correct title and description", () => {
    expect(GenerateMusicNode.title).toBe("Generate Music");
    expect(GenerateMusicNode.description).toContain("Suno AI");
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(GenerateMusicNode);
  });

  it("non-custom mode: succeeds with prompt", async () => {
    const node = new GenerateMusicNode();
    const result = await node.process({
      ...secrets,
      prompt: "a chill lo-fi beat",
    });
    expect(kieExecuteSunoTask).toHaveBeenCalledTimes(1);
    expect(kieExecuteTask).not.toHaveBeenCalled();
    const call = vi.mocked(kieExecuteSunoTask).mock.calls[0];
    expect(call[0]).toBe("test-api-key");
    expect(call[1]).toMatchObject({
      customMode: false,
      prompt: "a chill lo-fi beat",
    });
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("non-custom mode: throws on empty prompt", async () => {
    const node = new GenerateMusicNode();
    await expect(node.process({ ...secrets, prompt: "" })).rejects.toThrow(
      "prompt is required"
    );
  });

  it("custom mode: requires style and title", async () => {
    const node = new GenerateMusicNode();
    await expect(
      node.process({
        ...secrets,
        custom_mode: true,
        prompt: "lyrics",
        style: "",
        title: "My Song",
      })
    ).rejects.toThrow("style is required in custom mode");

    await expect(
      node.process({
        ...secrets,
        custom_mode: true,
        prompt: "lyrics",
        style: "pop",
        title: "",
      })
    ).rejects.toThrow("title is required in custom mode");
  });

  it("custom mode with vocals: requires prompt", async () => {
    const node = new GenerateMusicNode();
    await expect(
      node.process({
        ...secrets,
        custom_mode: true,
        instrumental: false,
        style: "pop",
        title: "My Song",
        prompt: "",
      })
    ).rejects.toThrow("prompt required in custom mode with vocals");
  });

  it("custom mode instrumental: succeeds without prompt", async () => {
    const node = new GenerateMusicNode();
    const result = await node.process({
      ...secrets,
      custom_mode: true,
      instrumental: true,
      style: "jazz",
      title: "Jazzy Tune",
      prompt: "",
    });
    expect(kieExecuteSunoTask).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("custom mode sends optional fields only when non-empty", async () => {
    const node = new GenerateMusicNode();
    await node.process({
      ...secrets,
      custom_mode: true,
      instrumental: true,
      style: "rock",
      title: "Rock It",
      prompt: "",
      negative_tags: "screamo",
      vocal_gender: "male",
      style_weight: 5,
      weirdness_constraint: 3,
      audio_weight: 2,
      persona_id: "p123",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.negativeTags).toBe("screamo");
    expect(payload.vocalGender).toBe("male");
    expect(payload.styleWeight).toBe(5);
    expect(payload.weirdnessConstraint).toBe(3);
    expect(payload.audioWeight).toBe(2);
    expect(payload.personaId).toBe("p123");
  });

  it("custom mode omits optional fields when empty/zero", async () => {
    const node = new GenerateMusicNode();
    await node.process({
      ...secrets,
      custom_mode: true,
      instrumental: true,
      style: "rock",
      title: "Rock It",
      prompt: "",
      negative_tags: "",
      vocal_gender: "",
      style_weight: 0,
      weirdness_constraint: 0,
      audio_weight: 0,
      persona_id: "",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.negativeTags).toBeUndefined();
    expect(payload.vocalGender).toBeUndefined();
    expect(payload.styleWeight).toBeUndefined();
    expect(payload.weirdnessConstraint).toBeUndefined();
    expect(payload.audioWeight).toBeUndefined();
    expect(payload.personaId).toBeUndefined();
  });

  it("uses kieExecuteSunoTask, not kieExecuteTask", async () => {
    const node = new GenerateMusicNode();
    await node.process({ ...secrets, prompt: "test" });
    expect(kieExecuteSunoTask).toHaveBeenCalledTimes(1);
    expect(kieExecuteTask).not.toHaveBeenCalled();
  });
});

// ─── ExtendMusicNode ─────────────────────────────────────────────────────────

describe("ExtendMusicNode", () => {
  it("has correct nodeType", () => {
    expect(ExtendMusicNode.nodeType).toBe("kie.audio.ExtendMusic");
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ExtendMusicNode);
  });

  it("throws when audio is not set", async () => {
    const node = new ExtendMusicNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new ExtendMusicNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      prompt: "continue with drums",
      style: "rock",
      continue_at: 30,
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    expect(kieExecuteSunoTask).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.audio_url).toBe(
      "https://uploaded.example.com/audio.mp3"
    );
    expect(payload.continue_at).toBe(30);
    expect(payload.continue).toBe(true);
    expect(payload.customMode).toBe(true);
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("uses kieExecuteSunoTask", async () => {
    const node = new ExtendMusicNode();
    await node.process({ ...secrets, audio: audioRef });
    expect(kieExecuteSunoTask).toHaveBeenCalled();
    expect(kieExecuteTask).not.toHaveBeenCalled();
  });
});

// ─── CoverAudioNode ─────────────────────────────────────────────────────────

describe("CoverAudioNode", () => {
  it("has correct nodeType", () => {
    expect(CoverAudioNode.nodeType).toBe("kie.audio.CoverAudio");
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(CoverAudioNode);
  });

  it("throws when audio is not set", async () => {
    const node = new CoverAudioNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new CoverAudioNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      prompt: "jazz cover",
      style: "jazz",
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    expect(kieExecuteSunoTask).toHaveBeenCalledTimes(1);

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.cover).toBe(true);
    expect(payload.audio_url).toBe(
      "https://uploaded.example.com/audio.mp3"
    );
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("sends vocalGender when provided", async () => {
    const node = new CoverAudioNode();
    await node.process({
      ...secrets,
      audio: audioRef,
      vocal_gender: "female",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.vocalGender).toBe("female");
  });

  it("omits vocalGender when empty", async () => {
    const node = new CoverAudioNode();
    await node.process({
      ...secrets,
      audio: audioRef,
      vocal_gender: "",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.vocalGender).toBeUndefined();
  });
});

// ─── AddInstrumentalNode ─────────────────────────────────────────────────────

describe("AddInstrumentalNode", () => {
  it("has correct nodeType", () => {
    expect(AddInstrumentalNode.nodeType).toBe("kie.audio.AddInstrumental");
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(AddInstrumentalNode);
  });

  it("throws when audio is not set", async () => {
    const node = new AddInstrumentalNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new AddInstrumentalNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      prompt: "add piano",
      style: "classical",
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.add_instrumental).toBe(true);
    expect(payload.instrumental).toBe(true);
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("uses kieExecuteSunoTask", async () => {
    const node = new AddInstrumentalNode();
    await node.process({ ...secrets, audio: audioRef });
    expect(kieExecuteSunoTask).toHaveBeenCalled();
    expect(kieExecuteTask).not.toHaveBeenCalled();
  });
});

// ─── AddVocalsNode ───────────────────────────────────────────────────────────

describe("AddVocalsNode", () => {
  it("has correct nodeType", () => {
    expect(AddVocalsNode.nodeType).toBe("kie.audio.AddVocals");
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(AddVocalsNode);
  });

  it("throws when audio is not set", async () => {
    const node = new AddVocalsNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new AddVocalsNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      prompt: "sing along",
      style: "pop",
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.add_vocals).toBe(true);
    expect(payload.instrumental).toBe(false);
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("sends vocalGender when provided", async () => {
    const node = new AddVocalsNode();
    await node.process({
      ...secrets,
      audio: audioRef,
      vocal_gender: "male",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.vocalGender).toBe("male");
  });

  it("omits vocalGender when empty", async () => {
    const node = new AddVocalsNode();
    await node.process({
      ...secrets,
      audio: audioRef,
      vocal_gender: "",
    });

    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.vocalGender).toBeUndefined();
  });
});

// ─── ReplaceMusicSectionNode ─────────────────────────────────────────────────

describe("ReplaceMusicSectionNode", () => {
  it("has correct nodeType", () => {
    expect(ReplaceMusicSectionNode.nodeType).toBe(
      "kie.audio.ReplaceMusicSection"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ReplaceMusicSectionNode);
  });

  it("throws when audio is not set", async () => {
    const node = new ReplaceMusicSectionNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio and time range", async () => {
    const node = new ReplaceMusicSectionNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      prompt: "replace with guitar solo",
      style: "rock",
      start_time: 10,
      end_time: 45,
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    const payload = vi.mocked(kieExecuteSunoTask).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.replace_section).toBe(true);
    expect(payload.start_time).toBe(10);
    expect(payload.end_time).toBe(45);
    expect(payload.audio_url).toBe(
      "https://uploaded.example.com/audio.mp3"
    );
    expect(result).toEqual({ output: { data: "c3Vub2RhdGE=" } });
  });

  it("uses kieExecuteSunoTask", async () => {
    const node = new ReplaceMusicSectionNode();
    await node.process({ ...secrets, audio: audioRef });
    expect(kieExecuteSunoTask).toHaveBeenCalled();
    expect(kieExecuteTask).not.toHaveBeenCalled();
  });
});

// ─── ElevenLabsTextToSpeechNode ──────────────────────────────────────────────

describe("ElevenLabsTextToSpeechNode", () => {
  it("has correct nodeType", () => {
    expect(ElevenLabsTextToSpeechNode.nodeType).toBe(
      "kie.audio.ElevenLabsTextToSpeech"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ElevenLabsTextToSpeechNode);
  });

  it("throws when text is empty", async () => {
    const node = new ElevenLabsTextToSpeechNode();
    await expect(
      node.process({ ...secrets, text: "", voice_id: "v1" })
    ).rejects.toThrow("text is required");
  });

  it("throws when voice_id is empty", async () => {
    const node = new ElevenLabsTextToSpeechNode();
    await expect(
      node.process({ ...secrets, text: "Hello world", voice_id: "" })
    ).rejects.toThrow("voice_id is required");
  });

  it("succeeds with valid text and voice_id", async () => {
    const node = new ElevenLabsTextToSpeechNode();
    const result = await node.process({
      ...secrets,
      text: "Hello world",
      voice_id: "voice_abc",
      model_id: "eleven_turbo_v2",
    });

    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "elevenlabs/text-to-speech",
      {
        text: "Hello world",
        voice_id: "voice_abc",
        model_id: "eleven_turbo_v2",
      }
    );
    expect(kieExecuteSunoTask).not.toHaveBeenCalled();
    expect(result).toEqual({ output: { data: "YXVkaW9kYXRh" } });
  });

  it("uses default model_id when not specified", async () => {
    const node = new ElevenLabsTextToSpeechNode();
    await node.process({
      ...secrets,
      text: "Hi",
      voice_id: "v1",
    });

    const call = vi.mocked(kieExecuteTask).mock.calls[0];
    expect((call[2] as Record<string, unknown>).model_id).toBe(
      "eleven_multilingual_v2"
    );
  });
});

// ─── ElevenLabsAudioIsolationNode ────────────────────────────────────────────

describe("ElevenLabsAudioIsolationNode", () => {
  it("has correct nodeType", () => {
    expect(ElevenLabsAudioIsolationNode.nodeType).toBe(
      "kie.audio.ElevenLabsAudioIsolation"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ElevenLabsAudioIsolationNode);
  });

  it("throws when audio is not set", async () => {
    const node = new ElevenLabsAudioIsolationNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new ElevenLabsAudioIsolationNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "elevenlabs/audio-isolation",
      { audio_url: "https://uploaded.example.com/audio.mp3" }
    );
    expect(result).toEqual({ output: { data: "YXVkaW9kYXRh" } });
  });

  it("uses kieExecuteTask, not kieExecuteSunoTask", async () => {
    const node = new ElevenLabsAudioIsolationNode();
    await node.process({ ...secrets, audio: audioRef });
    expect(kieExecuteTask).toHaveBeenCalled();
    expect(kieExecuteSunoTask).not.toHaveBeenCalled();
  });
});

// ─── ElevenLabsSoundEffectNode ───────────────────────────────────────────────

describe("ElevenLabsSoundEffectNode", () => {
  it("has correct nodeType", () => {
    expect(ElevenLabsSoundEffectNode.nodeType).toBe(
      "kie.audio.ElevenLabsSoundEffect"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ElevenLabsSoundEffectNode);
  });

  it("throws when text is empty", async () => {
    const node = new ElevenLabsSoundEffectNode();
    await expect(
      node.process({ ...secrets, text: "" })
    ).rejects.toThrow("text is required");
  });

  it("succeeds with valid text", async () => {
    const node = new ElevenLabsSoundEffectNode();
    const result = await node.process({
      ...secrets,
      text: "thunder crash",
      duration_seconds: 5,
      prompt_influence: 0.8,
    });

    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "elevenlabs/sound-effect",
      {
        text: "thunder crash",
        prompt_influence: 0.8,
        duration_seconds: 5,
      }
    );
    expect(result).toEqual({ output: { data: "YXVkaW9kYXRh" } });
  });

  it("omits duration_seconds when zero", async () => {
    const node = new ElevenLabsSoundEffectNode();
    await node.process({
      ...secrets,
      text: "rain",
      duration_seconds: 0,
    });

    const taskInput = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(taskInput.duration_seconds).toBeUndefined();
  });

  it("includes duration_seconds when positive", async () => {
    const node = new ElevenLabsSoundEffectNode();
    await node.process({
      ...secrets,
      text: "rain",
      duration_seconds: 10,
    });

    const taskInput = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(taskInput.duration_seconds).toBe(10);
  });
});

// ─── ElevenLabsSpeechToTextNode ──────────────────────────────────────────────

describe("ElevenLabsSpeechToTextNode", () => {
  it("has correct nodeType", () => {
    expect(ElevenLabsSpeechToTextNode.nodeType).toBe(
      "kie.audio.ElevenLabsSpeechToText"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ElevenLabsSpeechToTextNode);
  });

  it("throws when audio is not set", async () => {
    const node = new ElevenLabsSpeechToTextNode();
    await expect(
      node.process({ ...secrets, audio: null })
    ).rejects.toThrow("audio is required");
  });

  it("succeeds with valid audio input", async () => {
    const node = new ElevenLabsSpeechToTextNode();
    const result = await node.process({
      ...secrets,
      audio: audioRef,
      language_code: "fr",
    });

    expect(uploadAudioInput).toHaveBeenCalledWith("test-api-key", audioRef);
    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "elevenlabs/speech-to-text",
      {
        audio_url: "https://uploaded.example.com/audio.mp3",
        language_code: "fr",
      }
    );
    expect(result).toEqual({ output: { data: "YXVkaW9kYXRh" } });
  });

  it("uses the serialized default language_code when omitted", async () => {
    const node = new ElevenLabsSpeechToTextNode();
    await node.process({
      ...secrets,
      audio: audioRef,
    });

    const taskInput = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(taskInput.language_code).toBe("");
  });
});

// ─── ElevenLabsV3DialogueNode ────────────────────────────────────────────────

describe("ElevenLabsV3DialogueNode", () => {
  it("has correct nodeType", () => {
    expect(ElevenLabsV3DialogueNode.nodeType).toBe(
      "kie.audio.ElevenLabsV3Dialogue"
    );
  });

  it("defaults() returns expected values", () => {
    expectMetadataDefaults(ElevenLabsV3DialogueNode);
  });

  it("throws when script is empty", async () => {
    const node = new ElevenLabsV3DialogueNode();
    await expect(
      node.process({ ...secrets, script: "" })
    ).rejects.toThrow("script is required");
  });

  it("succeeds with valid script", async () => {
    const voices = { Alice: "voice_1", Bob: "voice_2" };
    const node = new ElevenLabsV3DialogueNode();
    const result = await node.process({
      ...secrets,
      script: "Alice: Hello!\nBob: Hi!",
      voice_assignments: voices,
    });

    expect(kieExecuteTask).toHaveBeenCalledWith(
      "test-api-key",
      "elevenlabs/v3-dialogue",
      {
        script: "Alice: Hello!\nBob: Hi!",
        voice_assignments: voices,
      }
    );
    expect(kieExecuteSunoTask).not.toHaveBeenCalled();
    expect(result).toEqual({ output: { data: "YXVkaW9kYXRh" } });
  });

  it("sends empty voice_assignments when not provided", async () => {
    const node = new ElevenLabsV3DialogueNode();
    await node.process({
      ...secrets,
      script: "Narrator: Once upon a time...",
    });

    const taskInput = vi.mocked(kieExecuteTask).mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(taskInput.voice_assignments).toEqual({});
  });
});
