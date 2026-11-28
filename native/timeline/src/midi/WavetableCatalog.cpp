// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#include "midi/WavetableCatalog.h"
#include "midi/WavetablePresets.h"

namespace nt::midi {

QVariantList WavetableCatalog::presets() const {
    QVariantList out;
    for (const auto& preset : factoryWavetablePresets()) {
        out.append(QVariantMap{
            {QStringLiteral("value"), QString::fromUtf8(preset.id)},
            {QStringLiteral("label"), QString::fromUtf8(preset.name)},
            {QStringLiteral("category"), QString::fromUtf8(preset.category)},
        });
    }
    return out;
}

QVariantList WavetableCatalog::tables() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("prime")}, {QStringLiteral("label"), QStringLiteral("Prime")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("bloom")}, {QStringLiteral("label"), QStringLiteral("Bloom")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("pulse")}, {QStringLiteral("label"), QStringLiteral("Pulse")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("vox")}, {QStringLiteral("label"), QStringLiteral("Vox")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("chime")}, {QStringLiteral("label"), QStringLiteral("Chime")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("glitch")}, {QStringLiteral("label"), QStringLiteral("Glitch")}},
    };
}

QVariantList WavetableCatalog::filterTypes() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("lp12")}, {QStringLiteral("label"), QStringLiteral("LP 12")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("lp24")}, {QStringLiteral("label"), QStringLiteral("LP 24")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("hp12")}, {QStringLiteral("label"), QStringLiteral("HP 12")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("hp24")}, {QStringLiteral("label"), QStringLiteral("HP 24")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("bp12")}, {QStringLiteral("label"), QStringLiteral("BP 12")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("bp24")}, {QStringLiteral("label"), QStringLiteral("BP 24")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("none")}, {QStringLiteral("label"), QStringLiteral("Off")}},
    };
}

QVariantList WavetableCatalog::lfoShapes() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("sine")}, {QStringLiteral("label"), QStringLiteral("Sine")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("tri")}, {QStringLiteral("label"), QStringLiteral("Tri")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("saw")}, {QStringLiteral("label"), QStringLiteral("Saw")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("square")}, {QStringLiteral("label"), QStringLiteral("Square")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("sh")}, {QStringLiteral("label"), QStringLiteral("S&H")}},
    };
}

QVariantMap WavetableCatalog::presetInstrument(const QString& presetId) const {
    const auto* preset = findWavetablePreset(presetId.toStdString());
    if (!preset) {
        return {};
    }
    return wavetableParamsToJson(preset->params, presetId).toVariantMap();
}

}  // namespace nt::midi
