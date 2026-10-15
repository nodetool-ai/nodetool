import type { Meta, StoryObj } from "@storybook/react-vite";
import AudioSampleEditor from "../components/audio_editor/AudioSampleEditor";
import { encodeWav } from "../components/audio_editor/audioSample";
import AudioPlayer from "../components/audio/AudioPlayer";
import AudioViewer from "../components/asset_viewer/AudioViewer";
import type { Asset } from "../stores/ApiTypes";

const SAMPLE_RATE = 22050;
const DURATION_SECONDS = 12;

/** A deterministic stereo phrase: pulsed tones under a slow swell. */
const buildDemoWavUrl = (): string => {
  const frames = SAMPLE_RATE * DURATION_SECONDS;
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SAMPLE_RATE;
    const beat = t % 0.5;
    const envelope = Math.exp(-beat * 7) * (0.35 + 0.3 * Math.sin(t * 0.6));
    const tone =
      Math.sin(2 * Math.PI * 220 * t) * 0.6 +
      Math.sin(2 * Math.PI * 330 * t) * 0.3;
    const swell = Math.sin(2 * Math.PI * 110 * t) * 0.15 * Math.sin(t * 0.4);
    left[i] = envelope * tone + swell;
    right[i] = envelope * tone * 0.8 + swell * 1.2;
  }
  const bytes = new Uint8Array(
    encodeWav({ sampleRate: SAMPLE_RATE, channels: [left, right] })
  );
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const DEMO_URL = buildDemoWavUrl();

const DEMO_ASSET = {
  id: "story-audio",
  name: "Demo phrase.wav",
  content_type: "audio/wav",
  get_url: DEMO_URL
} as Asset;

const meta = {
  title: "Surfaces/Audio",
  parameters: { layout: "fullscreen" }
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleEditor: Story = {
  render: () => (
    <div style={{ width: 1180, height: 460 }}>
      <AudioSampleEditor asset={DEMO_ASSET} onClose={() => undefined} />
    </div>
  )
};

export const SampleEditorWithSelection: Story = {
  render: () => (
    <div style={{ width: 1180, height: 460 }}>
      <AudioSampleEditor
        asset={DEMO_ASSET}
        onClose={() => undefined}
        initialSelection={{ start: 3, end: 6.5 }}
      />
    </div>
  )
};

export const SampleEditorNarrow: Story = {
  render: () => (
    <div style={{ width: 640, height: 420 }}>
      <AudioSampleEditor asset={DEMO_ASSET} onClose={() => undefined} />
    </div>
  )
};

export const PlayerCompact: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <AudioPlayer source={DEMO_URL} height={80} waveformHeight={80} />
    </div>
  )
};

export const PlayerWithFilename: Story = {
  render: () => (
    <div style={{ width: 420 }}>
      <AudioPlayer
        source={DEMO_URL}
        filename="Demo phrase.wav"
        height={60}
        waveformHeight={60}
      />
    </div>
  )
};

export const Viewer: Story = {
  render: () => (
    <div style={{ width: 1180, height: 560 }}>
      <AudioViewer asset={DEMO_ASSET} />
    </div>
  )
};
