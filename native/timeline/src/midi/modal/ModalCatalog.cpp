// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#include "midi/modal/ModalCatalog.h"
#include "midi/modal/ModalDsp.h"
#include "midi/modal/ModalEdits.h"
#include "midi/modal/ModalPresets.h"

namespace {
// timeline_qml is linked with WHOLE_ARCHIVE into every QML host and into
// tst_assistantcommands, so registering here makes modal.setPreset and
// modal.setParams available everywhere AssistantCommandTable is audited or run.
[[maybe_unused]] const bool modalEditsRegistered = [] {
    nt::midi::registerModalEdits();
    return true;
}();
}  // namespace

namespace nt::midi {

QVariantList ModalSynthCatalog::presets() const {
    QVariantList out;
    for (const auto& preset : factoryModalPresets()) {
        out.append(QVariantMap{
            {QStringLiteral("value"), QString::fromUtf8(preset.id)},
            {QStringLiteral("label"), QString::fromUtf8(preset.name)},
            {QStringLiteral("category"), QString::fromUtf8(preset.category)},
        });
    }
    return out;
}

QVariantList ModalSynthCatalog::models() const {
    QVariantList out;
    for (int i = 0; i < modal::kModelCount; ++i) {
        const auto m = static_cast<modal::ModalModel>(i);
        out.append(QVariantMap{
            {QStringLiteral("value"), QString::fromUtf8(modal::modalModelName(m))},
            {QStringLiteral("label"), QString::fromUtf8(modal::modalModelLabel(m))},
        });
    }
    return out;
}

QVariantList ModalSynthCatalog::couplings() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("parallel")}, {QStringLiteral("label"), QStringLiteral("A+B")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("serial")}, {QStringLiteral("label"), QStringLiteral("A>B")}},
    };
}

QVariantList ModalSynthCatalog::partialCounts() const {
    return {
        QVariantMap{{QStringLiteral("value"), 1}, {QStringLiteral("label"), QStringLiteral("1")}},
        QVariantMap{{QStringLiteral("value"), 2}, {QStringLiteral("label"), QStringLiteral("2")}},
        QVariantMap{{QStringLiteral("value"), 4}, {QStringLiteral("label"), QStringLiteral("4")}},
        QVariantMap{{QStringLiteral("value"), 8}, {QStringLiteral("label"), QStringLiteral("8")}},
        QVariantMap{{QStringLiteral("value"), 16}, {QStringLiteral("label"), QStringLiteral("16")}},
        QVariantMap{{QStringLiteral("value"), 32}, {QStringLiteral("label"), QStringLiteral("32")}},
        QVariantMap{{QStringLiteral("value"), 64}, {QStringLiteral("label"), QStringLiteral("64")}},
    };
}

QVariantList ModalSynthCatalog::noiseFilterModes() const {
    return {
        QVariantMap{{QStringLiteral("value"), QStringLiteral("lp")}, {QStringLiteral("label"), QStringLiteral("LP")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("bp")}, {QStringLiteral("label"), QStringLiteral("BP")}},
        QVariantMap{{QStringLiteral("value"), QStringLiteral("hp")}, {QStringLiteral("label"), QStringLiteral("HP")}},
    };
}

QVariantMap ModalSynthCatalog::presetInstrument(const QString& presetId) const {
    const auto* preset = findModalPreset(presetId.toStdString());
    if (!preset) return {};
    return modalParamsToJson(preset->params, presetId).toVariantMap();
}

}  // namespace nt::midi
