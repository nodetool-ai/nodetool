#pragma once
#include <QJsonArray>
#include <QJsonObject>

namespace nt { struct Timeline; namespace audio { struct MixPlan; } }
namespace nt::automation {
// Control-thread only. Replaces mixer envelopes without touching insert or buffer state.
void refreshMixerAutomation(const nt::Timeline& timeline,nt::audio::MixPlan& plan);
double automationValueAt(const QJsonArray& points, double timeMs, double fallback = 0);
QJsonArray automationBreakpoints(const QJsonArray& points, double fromMs, const QJsonObject& options = {});
}
