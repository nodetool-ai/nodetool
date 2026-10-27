#include "Preferences.h"
#include "edit/ClipGestureController.h"
#include "audio/LoopbackCapture.h"
#include <QCoreApplication>
#include <QFileInfo>
#include <QDir>
#include <QKeyEvent>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQuickWindow>
#include <QTimer>
#include <algorithm>

namespace nt::app {
namespace {
bool validLayout(const QString& layout) {
    return layout == "nodetool" || layout == "premiere" || layout == "fcp";
}
bool validDecoder(const QString& mode) {
    return mode == "sw" || mode == "hw" || mode == "auto";
}
}
Preferences::Preferences(QObject* parent) : QObject(parent) {
    m_settings = openTimelinePreferences();
    m_devices.append(QVariantMap{{"label", "System default"}, {"value", ""}});
}
QString Preferences::keyboardLayout() const {
    const QString value = m_settings->value("keyboardLayout", "nodetool").toString();
    return validLayout(value) ? value : QStringLiteral("nodetool");
}
QString Preferences::cacheFolder() const { return m_settings->value("cacheFolder").toString(); }
qint64 Preferences::cacheBudgetMb() const {
    return readCacheBudgetMb(*m_settings);
}
QString Preferences::decoderMode() const {
    const QString value = m_settings->value("decoderMode", "sw").toString();
    return validDecoder(value) ? value : QStringLiteral("sw");
}
QString Preferences::audioDevice() const { return m_settings->value("audioDevice").toString(); }
void Preferences::write(const QString& key, const QVariant& value) {
    if (m_settings->contains(key) && m_settings->value(key) == value) {
        return;
    }
    m_settings->setValue(key, value);
    m_settings->sync();
    emit changed();
}
void Preferences::setKeyboardLayout(const QString& value) {
    if (validLayout(value)) {
        write("keyboardLayout", value);
    }
}
void Preferences::setCacheFolder(const QString& value) { write("cacheFolder", value); }
void Preferences::setCacheBudgetMb(qint64 value) { write("cacheBudgetMb", std::clamp(value, -kMaxCacheBudgetMb, kMaxCacheBudgetMb)); }
void Preferences::setDecoderMode(const QString& value) {
    if (validDecoder(value)) {
        write("decoderMode", value);
    }
}
void Preferences::setAudioDevice(const QString& value) { write("audioDevice", value); }
void Preferences::refreshDevices() {
    m_devices = {QVariantMap{{"label", "System default"}, {"value", ""}}};
    std::string error;
    const auto devices = nt::audio::listAudioDevices(&error);
    for (const auto& device : devices.playback) {
        const QString name = QString::fromStdString(device);
        m_devices.append(QVariantMap{{"label", name}, {"value", name}});
    }
    if (!audioDevice().isEmpty() && std::none_of(m_devices.cbegin(), m_devices.cend(), [this](const QVariant& device) {
            return device.toMap().value("value").toString() == audioDevice();
        })) {
        m_devices.append(QVariantMap{{"label", audioDevice() + " (unavailable)"}, {"value", audioDevice()}});
    }
    emit devicesChanged();
}
namespace {
QString safeServerUrl(const QUrl& url) {
    if ((url.scheme() != "http" && url.scheme() != "https") || url.host().isEmpty()) {
        return {};
    }
    return url.adjusted(QUrl::RemoveUserInfo | QUrl::RemoveQuery | QUrl::RemoveFragment).toString(QUrl::FullyEncoded);
}
struct InteractiveSource { bool interactive = true; QString path; };
InteractiveSource interactiveSource(const QStringList& arguments) {
    const QSet<QString> switches{"--play", "--on-top"};
    const QSet<QString> values{"--size", "--seek", "--decode", "--decoder", "--audio", "--audio-latency-ms",
        "--audio-report", "--server", "--timeline", "--cache-dir", "--token", "--loader-report"};
    InteractiveSource result;
    bool positionalOnly = false;
    for (qsizetype i = 1; i < arguments.size(); ++i) {
        const QString argument = arguments[i];
        if (!positionalOnly && argument == "--") {
            positionalOnly = true;
            continue;
        }
        if (!positionalOnly && argument.startsWith('-')) {
            const QString option = argument.section('=', 0, 0);
            if (switches.contains(argument)) {
                continue;
            }
            if (!values.contains(option)) {
                return {false, {}};
            }
            if (!argument.contains('=')) {
                if (++i >= arguments.size()) {
                    return {false, {}};
                }
            }
        } else if (result.path.isEmpty()) {
            result.path = argument;
        } else {
            return {false, {}};
        }
    }
    return result;
}
}
QVariantList Preferences::recentTimelines() const {
    QVariantList entries;
    const auto array = QJsonDocument::fromJson(m_settings->value("recentTimelines").toByteArray()).array();
    for (const auto& value : array) {
        const QVariantMap entry = value.toObject().toVariantMap();
        if (!recentTimelineArguments(entry).isEmpty()) {
            if (entry.value("kind") == "server") {
                entries.append(QVariantMap{{"kind", "server"}, {"label", entry.value("label")},
                    {"server", safeServerUrl(QUrl(entry.value("server").toString()))}, {"timelineId", entry.value("timelineId")}});
            } else {
                entries.append(QVariantMap{{"kind", "file"}, {"label", entry.value("label")}, {"path", entry.value("path")}});
            }
        }
        if (entries.size() == 10) {
            break;
        }
    }
    return entries;
}
void Preferences::writeRecent(const QVariantList& entries) {
    m_settings->setValue("recentTimelines", QJsonDocument(QJsonArray::fromVariantList(entries)).toJson(QJsonDocument::Compact));
    m_settings->sync();
    emit recentTimelinesChanged();
}
void Preferences::addRecent(QVariantMap entry) {
    const auto arguments = recentTimelineArguments(entry);
    if (arguments.isEmpty()) {
        return;
    }
    auto entries = recentTimelines();
    entries.removeIf([&arguments](const QVariant& value) { return recentTimelineArguments(value.toMap()) == arguments; });
    entries.prepend(entry);
    while (entries.size() > 10) {
        entries.removeLast();
    }
    writeRecent(entries);
}
void Preferences::addRecentFile(const QString& label, const QString& path) {
    if (path.isEmpty()) {
        return;
    }
    addRecent({{"kind", "file"}, {"label", label}, {"path", QDir::cleanPath(QFileInfo(path).absoluteFilePath())}});
}
void Preferences::addRecentServer(const QString& label, const nt::server::SaveTarget& target) {
    addRecent({{"kind", "server"}, {"label", label}, {"server", safeServerUrl(target.server)}, {"timelineId", target.timelineId}});
}
void Preferences::clearRecentTimelines() { writeRecent({}); }
QStringList recentTimelineArguments(const QVariantMap& entry) {
    if (entry.value("kind") == "server") {
        const QString server = safeServerUrl(QUrl(entry.value("server").toString()));
        const QString id = entry.value("timelineId").toString();
        return server.isEmpty() || id.isEmpty() ? QStringList() : QStringList{"--server", server, "--timeline", id};
    }
    const QString path = entry.value("path").toString();
    return entry.value("kind") == "file" && QFileInfo(path).isAbsolute() ? QStringList{path} : QStringList();
}
bool interactiveTimelineRun(const QStringList& arguments) { return interactiveSource(arguments).interactive; }
bool recordOpenedTimeline(Preferences& preferences, const QStringList& arguments, bool active, const QString& label,
                          const std::optional<nt::server::SaveTarget>& target) {
    const auto source = interactiveSource(arguments);
    if (!active || !source.interactive) {
        return false;
    }
    if (target && !safeServerUrl(target->server).isEmpty() && !target->timelineId.isEmpty()) {
        preferences.addRecentServer(label, *target);
        return true;
    }
    if (source.path.isEmpty() || !QFileInfo(source.path).isFile()) {
        return false;
    }
    preferences.addRecentFile(label, source.path);
    return true;
}
bool Preferences::hasCacheFolder() const { return !cacheFolder().isEmpty(); }
bool Preferences::hasCacheBudget() const { return m_settings->contains("cacheBudgetMb"); }
void applyCachePreferences(const Preferences& preferences) {
    if (preferences.hasCacheFolder() && !qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_DIR")) {
        qputenv("NODETOOL_TIMELINE_CACHE_DIR", preferences.cacheFolder().toUtf8());
    }
    if (preferences.hasCacheBudget() && !qEnvironmentVariableIsSet("NODETOOL_TIMELINE_CACHE_BUDGET_MB")) {
        qputenv("NODETOOL_TIMELINE_CACHE_BUDGET_MB", QByteArray::number(preferences.cacheBudgetMb()));
    }
}
ShellPreferences::ShellPreferences(QObject* parent) : QObject(parent) {}
void ShellPreferences::setAnchor(QQuickItem* item) {
    if (m_anchor == item) {
        return;
    }
    if (m_anchor) {
        disconnect(m_anchor, nullptr, this, nullptr);
    }
    for (const auto& controller : std::as_const(m_controllers)) {
        if (controller) {
            disconnect(controller, nullptr, this, nullptr);
        }
    }
    m_controllers.clear();
    m_anchor = item;
    if (item) {
        connect(item, &QQuickItem::windowChanged, this, &ShellPreferences::bind);
    }
    QTimer::singleShot(0, this, &ShellPreferences::bind);
    emit anchorChanged();
}
void ShellPreferences::setStore(Preferences* store) {
    if (m_store == store) {
        return;
    }
    if (m_store) {
        disconnect(m_store, nullptr, this, nullptr);
    }
    m_store = store;
    if (store) {
        connect(store, &Preferences::changed, this, &ShellPreferences::bind);
    }
    bind();
    emit storeChanged();
}
void ShellPreferences::setDialogOpen(bool open) {
    if (m_dialogOpen != open) {
        m_dialogOpen = open;
        emit dialogOpenChanged();
    }
}
bool ShellPreferences::eventFilter(QObject* watched, QEvent* event) {
    if (watched == m_window && m_dialogOpen && event->type() == QEvent::KeyPress &&
        static_cast<QKeyEvent*>(event)->key() == Qt::Key_Escape) {
        emit closePreferencesRequested();
        return true;
    }
    return QObject::eventFilter(watched, event);
}
void ShellPreferences::bind() {
    if (!m_anchor || !m_anchor->window() || !m_store) {
        return;
    }
    auto* window = m_anchor->window();
    if (m_window != window) {
        if (m_window) {
            m_window->removeEventFilter(this);
            disconnect(m_window, nullptr, this, nullptr);
        }
        m_window = window;
        window->installEventFilter(this);
        m_recorded = false;
        connect(window, &QWindow::activeChanged, this, &ShellPreferences::recordActiveTimeline);
    }
    recordActiveTimeline();
    const auto controllers = window->contentItem()->findChildren<ClipGestureController*>();
    for (auto* controller : controllers) {
        if (!m_controllers.contains(controller)) {
            const QPointer<ClipGestureController> guard(controller);
            m_controllers.append(guard);
            connect(controller, &ClipGestureController::optionsChanged, this, [this, guard]() {
                if (guard && m_store && m_store->keyboardLayout() != guard->keyboardPreset()) {
                    m_store->setKeyboardLayout(guard->keyboardPreset());
                }
            });
        }
        controller->setKeyboardPreset(m_store->keyboardLayout());
    }
}
void ShellPreferences::recordActiveTimeline() {
    if (m_recorded || !m_window || !m_window->isActive() || !m_store) {
        return;
    }
    for (auto* item = m_anchor.data(); item; item = item->parentItem()) {
        const auto timeline = item->property("timeline");
        if (auto* model = qobject_cast<TimelineModel*>(timeline.value<QObject*>())) {
            m_recorded = recordOpenedTimeline(*m_store, QCoreApplication::arguments(), true, model->name(), nt::server::serverSaveTarget());
            return;
        }
    }
}
void ShellPreferences::restoreEditorFocus() {
    for (auto* item = m_anchor.data(); item; item = item->parentItem()) {
        if (item->property("timeline").isValid()) {
            item->forceActiveFocus();
            return;
        }
    }
}
}
