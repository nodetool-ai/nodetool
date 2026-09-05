/**
 * E1 criterion 13 and PRD D14: "~M:SS remaining" appears only when a duration
 * was measured for that model and that kind. No measurement, no text — the
 * null case is asserted as a null root, not as a missing string.
 */

import { act, render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import RemainingTime, { formatRemainingTime } from "../RemainingTime";
import {
  durationBucketKey,
  useStoryboardGenerationStore,
  type ShotJobState
} from "../../../stores/storyboard/StoryboardGenerationStore";

const SHOT = "s-timing";
const MODEL = "provider/still-v1";

const runningJob = (startedAt: number): ShotJobState => ({
  shotId: SHOT,
  boardId: "board-timing",
  jobId: "req-timing",
  kind: "keyframe",
  status: "running",
  startedAt,
  renderInputs: {
    kind: "keyframe",
    prompt_hash: "hash",
    model: MODEL,
    aspect_ratio: "16:9",
    style_entity_id: null,
    recorded_at: "2026-01-01T00:00:00.000Z"
  }
});

const seed = (samples: Record<string, number[]>, startedAt: number): void => {
  useStoryboardGenerationStore.setState({
    shotJobs: { [SHOT]: runningJob(startedAt) },
    jobToShot: { "req-timing": SHOT },
    generatingShotIds: [SHOT],
    failedShotIds: [],
    durationSamples: samples
  });
};

const renderRemaining = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <RemainingTime shotId={SHOT} />
    </ThemeProvider>
  );

describe("formatRemainingTime", () => {
  it("formats zero, under a minute, exactly a minute and past ten", () => {
    expect(formatRemainingTime(0)).toBe("~0:00");
    expect(formatRemainingTime(45)).toBe("~0:45");
    expect(formatRemainingTime(60)).toBe("~1:00");
    expect(formatRemainingTime(725)).toBe("~12:05");
  });

  it("clamps a negative remainder rather than printing a sign", () => {
    expect(formatRemainingTime(-30)).toBe("~0:00");
  });
});

describe("RemainingTime", () => {
  it("renders nothing when no duration was measured (criterion 13)", () => {
    seed({}, Date.now());

    const { container } = renderRemaining();

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the only measurement is for another model", () => {
    seed({ [durationBucketKey("keyframe", "provider/other")]: [30000] }, Date.now());

    const { container } = renderRemaining();

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the measurement is for the other kind", () => {
    seed({ [durationBucketKey("clip", MODEL)]: [30000] }, Date.now());

    const { container } = renderRemaining();

    expect(container.firstChild).toBeNull();
  });

  it("counts down from the measured duration for this model and kind", () => {
    jest.useFakeTimers();
    try {
      const startedAt = Date.now();
      seed({ [durationBucketKey("keyframe", MODEL)]: [30000] }, startedAt);

      const { container } = renderRemaining();
      expect(container.textContent).toBe("~0:30 remaining");

      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(container.textContent).toBe("~0:20 remaining");
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops once the render has overrun its estimate", () => {
    seed({ [durationBucketKey("keyframe", MODEL)]: [5000] }, Date.now() - 9000);

    const { container } = renderRemaining();

    expect(container.firstChild).toBeNull();
  });
});
