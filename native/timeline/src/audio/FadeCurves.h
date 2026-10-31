#pragma once

// Clip fade envelopes, ported from packages/timeline/src/audioFade.ts
// (DESIGN.md D26). Progress `t` runs 0 (silence) to 1 (full clip volume) for
// both edges. A fade-out reads the same curve with
// t = (durationMs - msIntoClip) / fadeOutMs.

#include <string>

namespace nt::audio {

enum class FadeShape { Linear, SCurve, Plus3dB, Minus3dB };

// "linear", "sCurve", "plus3dB", "minus3dB". Anything else is linear
// (`parseClipFadeShape`).
FadeShape parseFadeShape(const std::string& name);

// `fadeShapeGain`: the gain at progress t, with t clamped to [0, 1] and NaN
// read as 0.
double fadeShapeGain(FadeShape shape, double t);

struct ResolvedFades {
    double fadeInMs = 0.0;
    double fadeOutMs = 0.0;
    FadeShape fadeInShape = FadeShape::Linear;
    FadeShape fadeOutShape = FadeShape::Linear;
};

// `resolveClipFades`: each fade capped at the clip, and two that would cross
// each capped at half the clip.
ResolvedFades resolveClipFades(double fadeInMs, double fadeOutMs, FadeShape inShape, FadeShape outShape,
                               double durationMs);

// `clipFadeGain` on resolved fades: the envelope gain `msIntoClip` into a
// clip of `durationMs`, 0 outside the clip.
double clipFadeGain(const ResolvedFades& fades, double durationMs, double msIntoClip);

// `dbToGain` in AudioGraph.ts: 0 dB (or no value) is exactly 1.
double dbToGain(double db);

}  // namespace nt::audio
