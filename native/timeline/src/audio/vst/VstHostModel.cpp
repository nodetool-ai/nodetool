#include "audio/vst/VstHostModel.h"
#include "audio/vst/VstLiveChannel.h"

#include "model/TimelineModel.h"
#include <QJsonArray>
#include <QPointer>
#include <QUuid>

namespace nt::audio::vst {

VstHostModel::VstHostModel(QObject* parent) : QObject(parent), m_client(sharedVstHostClient()) {
    connect(m_client.get(), &VstHostClient::stateRestored, this, [this](const QString& instance, const QString& state, const QString& error) {
        auto pending = m_restorations.find(instance);
        if (pending == m_restorations.end()) { return; }
        if (--pending.value() > 0) { return; }
        m_restorations.erase(pending);
        setLastError(error);
        if (error.isEmpty()) { sharedVstLivePool().noteStateFromEditor(instance, state); }
    });
    connect(m_client.get(), &VstHostClient::scanFinished, this, [this](const QVariantList& plugins, const QString& error) {
        m_scanning = false;
        emit scanningChanged();
        if (!error.isEmpty()) {
            setLastError(error);
            return;
        }
        setLastError({});
        m_allPlugins = plugins;
        m_instruments.clear();
        m_effects.clear();
        for (const QVariant& entry : plugins) {
            const QVariantMap map = entry.toMap();
            if (map.value(QStringLiteral("isInstrument")).toBool()) {
                m_instruments.append(map);
            } else {
                m_effects.append(map);
            }
        }
        m_scanned = true;
        emit pluginsChanged();
    });

    connect(m_client.get(), &VstHostClient::editorOpened, this, [this](const QString& instance, const QString& error) {
        if (!error.isEmpty()) {
            setLastError(error);
            if (m_openEditors.removeAll(instance) > 0) emit openEditorsChanged();
            return;
        }
        setLastError({});
        sharedVstLivePool().setEditorOpen(instance, true);
        if (!m_openEditors.contains(instance)) {
            m_openEditors.append(instance);
            emit openEditorsChanged();
        }
    });

    connect(m_client.get(), &VstHostClient::editorClosedReply, this, [this](const QString& instance) {
        sharedVstLivePool().setEditorOpen(instance, false);
        if (m_openEditors.removeAll(instance) > 0) emit openEditorsChanged();
    });

    connect(m_client.get(), &VstHostClient::pluginStateChanged, this, [this](const QString& instance, const QString& state) {
        if (m_restorations.contains(instance)) { return; }
        sharedVstLivePool().noteStateFromEditor(instance, state);
        emit pluginStateChanged(instance, state);
    });

    connect(m_client.get(), &VstHostClient::pluginEditorClosed, this, [this](const QString& instance, const QString& state) {
        sharedVstLivePool().setEditorOpen(instance, false);
        if (m_openEditors.removeAll(instance) > 0) emit openEditorsChanged();
        if (m_restorations.contains(instance)) { return; }
        sharedVstLivePool().noteStateFromEditor(instance, state);
        emit pluginEditorClosed(instance, state);
    });

    connect(m_client.get(), &VstHostClient::hostExited, this, [this]() {
        m_restorations.clear();
        sharedVstLivePool().evictAll(nullptr);
        if (!m_openEditors.isEmpty()) {
            m_openEditors.clear();
            emit openEditorsChanged();
        }
        if (m_scanning) {
            m_scanning = false;
            emit scanningChanged();
        }
    });
}

void VstHostModel::followTimeline(TimelineModel* timeline) {
    if (m_timeline == timeline) { return; }
    disconnect(m_documentConnection);
    m_timeline = timeline;
    m_documentSlots.clear();
    m_hasDocument = false;
    if (!timeline) { return; }
    synchronizeDocument();
    m_documentConnection = connect(timeline, &TimelineModel::timelineChanged, this, &VstHostModel::synchronizeDocument);
}

void VstHostModel::synchronizeDocument() {
    if (!m_timeline) { return; }
    QMap<QString, QJsonObject> nextSlots;
    const auto add = [&nextSlots](const QString& key, const QJsonObject& slot) {
        if (slot.value("type") == "vst" && !slot.value("plugin").toObject().value("path").toString().isEmpty()) {
            nextSlots.insert(key, slot);
        }
    };
    const auto raw = m_timeline->timeline().raw;
    for (const auto& value : raw.value("tracks").toArray()) {
        const auto track = value.toObject();
        const auto id = track.value("id").toString();
        add("inst:" + id, track.value("instrument").toObject());
        for (const auto& effect : track.value("effects").toArray()) {
            const auto slot = effect.toObject();
            add("fx:" + id + ":" + slot.value("id").toString(), slot);
        }
    }
    for (const auto& effect : raw.value("master").toObject().value("effects").toArray()) {
        const auto slot = effect.toObject();
        add("master-fx:" + slot.value("id").toString(), slot);
    }
    for (auto it = m_documentSlots.cbegin(); it != m_documentSlots.cend(); ++it) {
        if (!nextSlots.contains(it.key())) {
            closeEditor(it.key());
            m_client->disposeAsync(it.key());
        }
    }
    for (auto it = nextSlots.cbegin(); it != nextSlots.cend(); ++it) {
        const auto previous = m_documentSlots.constFind(it.key());
        if (m_hasDocument && (previous == m_documentSlots.cend() ||
            previous->value("plugin") != it->value("plugin") || previous->value("state") != it->value("state"))) {
            if (previous != m_documentSlots.cend() && previous->value("plugin") != it->value("plugin")) {
                closeEditor(it.key());
            }
            ++m_restorations[it.key()];
            m_client->restoreStateAsync(it.key(), it.value());
        }
    }
    m_documentSlots = std::move(nextSlots);
    m_hasDocument = true;
}

bool VstHostModel::available() const { return m_client && m_client->available(); }

QString VstHostModel::statusReason() const { return m_client ? m_client->unavailableReason() : QString(); }

void VstHostModel::scan(bool rescan) {
    if (!m_client || m_scanning) return;
    if (!available()) {
        emit statusChanged();
        setLastError(statusReason());
        return;
    }
    m_scanning = true;
    setLastError({});
    emit scanningChanged();
    m_client->scanAsync(rescan);
}

void VstHostModel::openEditor(const QString& instance, const QString& path, const QString& uid,
                              const QString& state, const QString& title) {
    if (!m_client || instance.isEmpty() || path.isEmpty() || uid.isEmpty()) return;
    setLastError({});
    m_client->openEditorAsync(instance, path, uid, state, title);
}

void VstHostModel::closeEditor(const QString& instance) {
    if (!m_client || instance.isEmpty()) return;
    m_client->closeEditorAsync(instance);
}

void VstHostModel::closeAllEditors() {
    const QStringList open = m_openEditors;
    for (const QString& instance : open) {
        closeEditor(instance);
    }
}

bool VstHostModel::isEditorOpen(const QString& instance) const { return m_openEditors.contains(instance); }

QVariantMap VstHostModel::makeVstEffect(const QVariantMap& plugin) const {
    QVariant pluginVal;
    if (!plugin.value(QStringLiteral("path")).toString().isEmpty() &&
        !plugin.value(QStringLiteral("uid")).toString().isEmpty()) {
        pluginVal = QVariantMap{
            {QStringLiteral("uid"), plugin.value(QStringLiteral("uid")).toString()},
            {QStringLiteral("name"), plugin.value(QStringLiteral("name")).toString()},
            {QStringLiteral("vendor"), plugin.value(QStringLiteral("vendor")).toString()},
            {QStringLiteral("path"), plugin.value(QStringLiteral("path")).toString()},
            {QStringLiteral("format"), plugin.value(QStringLiteral("format"), QStringLiteral("vst3")).toString()},
        };
    }
    return QVariantMap{
        {QStringLiteral("id"), QUuid::createUuid().toString(QUuid::Id128)},
        {QStringLiteral("type"), QStringLiteral("vst")},
        {QStringLiteral("enabled"), true},
        {QStringLiteral("plugin"), pluginVal},
        {QStringLiteral("state"), QVariant()},
        {QStringLiteral("wet"), 1.0},
    };
}

QVariantMap VstHostModel::makeVstInstrument(const QVariantMap& plugin, double gainDb) const {
    QVariant pluginVal;
    if (!plugin.value(QStringLiteral("path")).toString().isEmpty() &&
        !plugin.value(QStringLiteral("uid")).toString().isEmpty()) {
        pluginVal = QVariantMap{
            {QStringLiteral("uid"), plugin.value(QStringLiteral("uid")).toString()},
            {QStringLiteral("name"), plugin.value(QStringLiteral("name")).toString()},
            {QStringLiteral("vendor"), plugin.value(QStringLiteral("vendor")).toString()},
            {QStringLiteral("path"), plugin.value(QStringLiteral("path")).toString()},
            {QStringLiteral("format"), plugin.value(QStringLiteral("format"), QStringLiteral("vst3")).toString()},
        };
    }
    return QVariantMap{
        {QStringLiteral("type"), QStringLiteral("vst")},
        {QStringLiteral("plugin"), pluginVal},
        {QStringLiteral("state"), QVariant()},
        {QStringLiteral("gainDb"), gainDb},
    };
}

void VstHostModel::setLastError(const QString& error) {
    if (m_lastError == error) return;
    m_lastError = error;
    emit lastErrorChanged();
}

}  // namespace nt::audio::vst
