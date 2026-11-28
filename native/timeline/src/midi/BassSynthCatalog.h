// Derived from georgi/fablesynth (https://github.com/georgi/fablesynth) at
// commit af55d51 / ae9fca7.
// FableSynth is published under PolyForm Noncommercial 1.0.0. Its author, who
// also maintains NodeTool, contributes this code to NodeTool under NodeTool's
// licence (AGPL-3.0).
#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::midi {

// QML singleton exposing the curated analog bass preset catalog and waveform
// options to QML panels.
// Ownership: created and owned by the QML engine as a singleton.
// Thread affinity: UI thread only (read-only metadata).
class BassSynthCatalog : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantList presets READ presets CONSTANT)
    Q_PROPERTY(QVariantList waveforms READ waveforms CONSTANT)
    Q_PROPERTY(QVariantList subShapes READ subShapes CONSTANT)

public:
    using QObject::QObject;

    [[nodiscard]] QVariantList presets() const;
    [[nodiscard]] QVariantList waveforms() const;
    [[nodiscard]] QVariantList subShapes() const;
    Q_INVOKABLE QVariantMap presetInstrument(const QString& presetId) const;
};

}  // namespace nt::midi
