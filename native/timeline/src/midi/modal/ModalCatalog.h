// Ported from RipplerX (https://github.com/tiagolr/ripplerx) at commit 11683a6.
// Copyright (C) 2025 tiagolr (tilr) — GNU General Public License v3.0 (GPL-3.0).
// Compatible with NodeTool's AGPL-3.0; see native/timeline/licenses/GPL-3.0.txt.
#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::midi {

// QML singleton exposing the modal percussion/mallet preset catalog, resonator
// models, and coupling choices to QML panels.
// Ownership: created and owned by the QML engine as a singleton.
// Thread affinity: UI thread only (read-only metadata).
class ModalSynthCatalog : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantList presets READ presets CONSTANT)
    Q_PROPERTY(QVariantList models READ models CONSTANT)
    Q_PROPERTY(QVariantList couplings READ couplings CONSTANT)
    Q_PROPERTY(QVariantList partialCounts READ partialCounts CONSTANT)
    Q_PROPERTY(QVariantList noiseFilterModes READ noiseFilterModes CONSTANT)

public:
    using QObject::QObject;

    [[nodiscard]] QVariantList presets() const;
    [[nodiscard]] QVariantList models() const;
    [[nodiscard]] QVariantList couplings() const;
    [[nodiscard]] QVariantList partialCounts() const;
    [[nodiscard]] QVariantList noiseFilterModes() const;
    Q_INVOKABLE QVariantMap presetInstrument(const QString& presetId) const;
};

}  // namespace nt::midi
