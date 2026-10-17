import type { TimelineTempo } from "@nodetool-ai/timeline";

import { Metronome, firstBeatIndexAt, metronomeClicks } from "../metronome";

const TEMPO_120: TimelineTempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};

interface FakeOscillator {
  frequency: { value: number };
  type: string;
  startedAt: number | null;
  stoppedAt: number | null;
  connect: jest.Mock;
  disconnect: jest.Mock;
  start: (when: number) => void;
  stop: (when: number) => void;
  onended: (() => void) | null;
}

function fakeContext() {
  const oscillators: FakeOscillator[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setTargetAtTime: jest.fn()
  });
  const context = {
    currentTime: 10,
    destination: {},
    createGain: () => ({ gain: param(), connect: jest.fn(), disconnect: jest.fn() }),
    createOscillator: () => {
      const osc: FakeOscillator = {
        frequency: { value: 0 },
        type: "sine",
        startedAt: null,
        stoppedAt: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        start(when) {
          this.startedAt = when;
        },
        stop(when) {
          this.stoppedAt = when;
        },
        onended: null
      };
      oscillators.push(osc);
      return osc;
    }
  };
  return { context: context as unknown as BaseAudioContext & { currentTime: number }, oscillators };
}

describe("metronomeClicks", () => {
  it("clicks on every beat and accents the downbeats", () => {
    const clicks = metronomeClicks(0, 2500, TEMPO_120);
    expect(clicks.map((c) => c.timeMs)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(clicks.map((c) => c.downbeat)).toEqual([true, false, false, false, true]);
  });

  it("reads 6/8 in eighth-note beats, two bars of six", () => {
    const tempo: TimelineTempo = { ...TEMPO_120, timeSignature: { beatsPerBar: 6, beatUnit: 8 } };
    const clicks = metronomeClicks(0, 3000, tempo);
    expect(clicks).toHaveLength(12);
    expect(clicks.filter((c) => c.downbeat).map((c) => c.timeMs)).toEqual([0, 1500]);
  });

  it("follows the tempo offset, so beat one sits at offsetMs", () => {
    const tempo = { ...TEMPO_120, offsetMs: 250 };
    expect(metronomeClicks(0, 1000, tempo).map((c) => c.timeMs)).toEqual([250, 750]);
    expect(firstBeatIndexAt(250, tempo)).toBe(0);
    expect(firstBeatIndexAt(251, tempo)).toBe(1);
  });
});

describe("Metronome", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("schedules the clicks on the audio clock from the playback anchor", () => {
    const { context, oscillators } = fakeContext();
    const metronome = new Metronome();
    // Playback starts at 1.25 s, the next beat (1.5 s) is 0.25 s away.
    metronome.start({ context, anchorContextSec: 10, anchorMs: 1250, rate: 1, tempo: TEMPO_120 });
    expect(oscillators).toHaveLength(0);

    context.currentTime = 10.2;
    jest.advanceTimersByTime(25);
    expect(oscillators.map((o) => o.startedAt)).toEqual([10.25]);
    expect(oscillators[0].frequency.value).toBe(1320);

    context.currentTime = 10.7;
    jest.advanceTimersByTime(25);
    // 2.0 s is bar 2's downbeat: accented.
    expect(oscillators.map((o) => o.startedAt)).toEqual([10.25, 10.75]);
    expect(oscillators[1].frequency.value).toBe(1760);
    expect(metronome.running).toBe(true);

    metronome.stop();
    expect(metronome.running).toBe(false);
    context.currentTime = 12;
    jest.advanceTimersByTime(100);
    expect(oscillators).toHaveLength(2);
  });

  it("does not run backwards", () => {
    const { context, oscillators } = fakeContext();
    const metronome = new Metronome();
    metronome.start({ context, anchorContextSec: 10, anchorMs: 1000, rate: -1, tempo: TEMPO_120 });
    jest.advanceTimersByTime(200);
    expect(metronome.running).toBe(false);
    expect(oscillators).toHaveLength(0);
  });
});
