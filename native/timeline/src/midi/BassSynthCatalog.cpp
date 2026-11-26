// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/BassSynthCatalog.h"
#include "midi/BassSynthPresets.h"

namespace nt::midi {

QVariantList BassSynthCatalog::presets() const {
    QVariantList out;
    for (const auto& preset : factoryBassPresets()) {
        out.append(QVariantMap{
            {QStringLiteral("value"), QString::fromUtf8(preset.id)},
            {QStringLiteral("label"), QString::fromUtf8(preset.name)},
            {QStringLiteral("category"), QString::fromUtf8(preset.category)},
        });
    }
    return out;
}

QVariantList BassSynthCatalog::waveforms() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("saw")}, {QStringLiteral("label"), QStringLiteral("Saw")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("square")}, {QStringLiteral("label"), QStringLiteral("Square")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("triangle")}, {QStringLiteral("label"), QStringLiteral("Tri")}},
    };
}

QVariantList BassSynthCatalog::subShapes() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("sine")}, {QStringLiteral("label"), QStringLiteral("Sine")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("square")}, {QStringLiteral("label"), QStringLiteral("Square")}},
    };
}

QVariantMap BassSynthCatalog::presetInstrument(const QString& presetId) const {
    const auto* preset = findBassPreset(presetId.toStdString());
    if (!preset) {
        return {};
    }
    return bassParamsToJson(preset->params, presetId).toVariantMap();
}

}  // namespace nt::midi
