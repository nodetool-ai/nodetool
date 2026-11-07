// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#pragma once
#include "export/ExportSettings.h"
#include <QObject>
#include <QSettings>
#include <QtQmlIntegration/qqmlintegration.h>
#include <memory>
#include <vector>

namespace nt::exporting {
struct ExportPreset {
    QString id;
    QString name;
    QString description;
    bool builtin = false;
    Settings settings;
};
std::vector<ExportPreset> builtinExportPresets();
}
class ExportPresets : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(QVariantList presets READ presets NOTIFY presetsChanged)
    Q_PROPERTY(QString lastPresetId READ lastPresetId WRITE setLastPresetId NOTIFY lastPresetIdChanged)
    Q_PROPERTY(QVariantMap lastSettings READ lastSettings WRITE setLastSettings NOTIFY lastSettingsChanged)
public:
    explicit ExportPresets(QObject* parent = nullptr);
    QVariantList presets() const;
    QString lastPresetId() const { return m_lastPresetId; }
    void setLastPresetId(const QString& id);
    QVariantMap lastSettings() const { return m_lastSettings; }
    void setLastSettings(const QVariantMap& settings);
    Q_INVOKABLE QVariantMap preset(const QString& id) const;
    Q_INVOKABLE QVariantMap settingsFor(const QString& id) const;
    Q_INVOKABLE QString saveUserPreset(const QString& name, const QVariantMap& settings);
    Q_INVOKABLE bool removeUserPreset(const QString& id);
    Q_INVOKABLE QString idForSettings(const QVariantMap& settings) const;
signals:
    void presetsChanged();
    void lastPresetIdChanged();
    void lastSettingsChanged();
private:
    void savePresets();
    std::unique_ptr<QSettings> m_settings;
    std::vector<nt::exporting::ExportPreset> m_presets;
    QString m_lastPresetId = QStringLiteral("match");
    QVariantMap m_lastSettings;
};
