// QML singleton exposing the curated WT-1 preset catalog and enum options to QML.
#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::midi {

// Thread affinity: UI thread only (read-only metadata).
class WavetableCatalog : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(QVariantList presets READ presets CONSTANT)
    Q_PROPERTY(QVariantList tables READ tables CONSTANT)
    Q_PROPERTY(QVariantList filterTypes READ filterTypes CONSTANT)
    Q_PROPERTY(QVariantList lfoShapes READ lfoShapes CONSTANT)

public:
    using QObject::QObject;

    [[nodiscard]] QVariantList presets() const;
    [[nodiscard]] QVariantList tables() const;
    [[nodiscard]] QVariantList filterTypes() const;
    [[nodiscard]] QVariantList lfoShapes() const;
    Q_INVOKABLE QVariantMap presetInstrument(const QString& presetId) const;
};

}  // namespace nt::midi
