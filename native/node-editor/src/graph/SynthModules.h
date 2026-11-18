#pragma once
#include "NodeLayout.h"
#include <QJsonObject>
class QPainter;

// UI thread only, like every card body: layouts and paints run on the scene's thread.
namespace nodetool {
struct CanvasTheme;
struct CardBodyInput;
struct CardBodyPaintState;

// The faceplate config of a synth module or audio effect node, as
// SYNTH_MODULE_CONFIGS and AUDIO_EFFECT_CONFIGS in
// web/src/components/node_types/synth/. resources/synth/modules.json holds a
// copy that scripts/generate-synth-modules.mjs writes. Empty for other types.
QJsonObject synthModule(const QString &type);

// The type of the speaker module, AUDIO_OUT_NODE_TYPE in bespokeNodeTypes.ts.
inline constexpr auto audioOutType = "nodetool.audio.realtime.AudioOutput";

// SynthModuleBody.tsx and AudioOutBody.tsx.
void layoutSynthModule(NodeLayout &layout, const CardBodyInput &input);
void layoutAudioOut(NodeLayout &layout, const CardBodyInput &input);

// SynthKnob.tsx: a 44 px face over its label and value, 56 px wide. A drag of
// 160 px sweeps the full range, a tenth of that with Shift.
namespace synth_metrics {
inline constexpr double knobSize = 44;
inline constexpr double knobWidth = knobSize + 12;
inline constexpr double knobHeight = knobSize + 26;
inline constexpr double knobDragRange = 160;
inline constexpr double knobFine = 0.1;
} // namespace synth_metrics

// knobNorm, knobDenorm and formatKnobValue in synthModules.ts, and
// roundForSpec in SynthKnob.tsx, over a Knob row's range and scale. A Knob
// row's step is 1 for an integer property and 0 for a continuous one.
double knobNorm(const NodeRow &row, double value);
double knobDenorm(const NodeRow &row, double t);
double knobRound(const NodeRow &row, double value);
QString knobText(const NodeRow &row, double value);
// The value a vertical drag from startY to y gives, starting at startValue.
double knobDragValue(const NodeRow &row, double startValue, double startY, double y, bool fine);
// The round face a press starts a drag on, in card coordinates.
QRectF knobFace(const NodeRow &row);

// Paints a Knob, Waveform, Envelope or Caption row. Returns false for other kinds.
bool paintSynthRow(QPainter *painter, const CanvasTheme &theme, const NodeLayout &layout, const NodeRow &row,
                   const CardBodyPaintState &state);
} // namespace nodetool
