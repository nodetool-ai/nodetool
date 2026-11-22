#pragma once

// QML singleton (`VstHost` in NodeTool.Timeline) bridging the UI to the
// out-of-process NodeToolVstHost client: scans VST3 instruments and audio
// effects asynchronously, opens/closes native plug-in editor windows, and
// relays live plug-in state updates to the timeline document.
//
// Thread affinity: UI thread only.

#include "audio/vst/VstHostClient.h"

#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>

#include <memory>

namespace nt::audio::vst {

class VstHostModel final : public QObject {
    Q_OBJECT
    QML_NAMED_ELEMENT(VstHost)
    QML_SINGLETON
    Q_PROPERTY(bool available READ available NOTIFY statusChanged)
    Q_PROPERTY(QString statusReason READ statusReason NOTIFY statusChanged)
    Q_PROPERTY(bool scanning READ scanning NOTIFY scanningChanged)
    Q_PROPERTY(bool scanned READ scanned NOTIFY pluginsChanged)
    Q_PROPERTY(QVariantList instruments READ instruments NOTIFY pluginsChanged)
    Q_PROPERTY(QVariantList effects READ effects NOTIFY pluginsChanged)
    Q_PROPERTY(QVariantList allPlugins READ allPlugins NOTIFY pluginsChanged)
    Q_PROPERTY(QStringList openEditors READ openEditors NOTIFY openEditorsChanged)
    Q_PROPERTY(QString lastError READ lastError NOTIFY lastErrorChanged)

public:
    explicit VstHostModel(QObject* parent = nullptr);
    ~VstHostModel() override = default;

    [[nodiscard]] bool available() const;
    [[nodiscard]] QString statusReason() const;
    [[nodiscard]] bool scanning() const { return m_scanning; }
    [[nodiscard]] bool scanned() const { return m_scanned; }
    [[nodiscard]] QVariantList instruments() const { return m_instruments; }
    [[nodiscard]] QVariantList effects() const { return m_effects; }
    [[nodiscard]] QVariantList allPlugins() const { return m_allPlugins; }
    [[nodiscard]] QStringList openEditors() const { return m_openEditors; }
    [[nodiscard]] QString lastError() const { return m_lastError; }

    Q_INVOKABLE void scan(bool rescan = false);
    Q_INVOKABLE void openEditor(const QString& instance, const QString& path, const QString& uid,
                                const QString& state, const QString& title);
    Q_INVOKABLE void closeEditor(const QString& instance);
    Q_INVOKABLE void closeAllEditors();
    Q_INVOKABLE bool isEditorOpen(const QString& instance) const;
    Q_INVOKABLE QVariantMap makeVstEffect(const QVariantMap& plugin = {}) const;
    Q_INVOKABLE QVariantMap makeVstInstrument(const QVariantMap& plugin = {}, double gainDb = 0.0) const;

signals:
    void statusChanged();
    void scanningChanged();
    void pluginsChanged();
    void openEditorsChanged();
    void lastErrorChanged();
    void pluginStateChanged(const QString& instance, const QString& state);
    void pluginEditorClosed(const QString& instance, const QString& state);

private:
    void setLastError(const QString& error);

    // Shared with the process-level VST mix stages so UI editor sessions and
    // audio renders talk to one NodeToolVstHost helper process.
    std::shared_ptr<VstHostClient> m_client;
    bool m_scanning = false;
    bool m_scanned = false;
    QVariantList m_allPlugins;
    QVariantList m_instruments;
    QVariantList m_effects;
    QStringList m_openEditors;
    QString m_lastError;
};

}  // namespace nt::audio::vst
