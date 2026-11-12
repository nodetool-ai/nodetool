#include "WorkflowVersions.h"
#include <QJsonDocument>
#include <QDateTime>
#include <QHash>
#include <QSet>
#include <QNetworkReply>
#include <QNetworkCookieJar>
#include <QUrlQuery>
#include <QRegularExpression>
#include <QClipboard>
#include <QGuiApplication>
#include <QLocale>
#include <QTimeZone>
#include <algorithm>
#include <limits>
#include <utility>
namespace nodetool::node_editor {
namespace {
QDateTime parseTimestamp(const QString &iso) {
    auto parsed = QDateTime::fromString(iso, Qt::ISODateWithMs);
    if (!parsed.isValid()) {
        parsed = QDateTime::fromString(iso, Qt::ISODate);
    }
    return parsed;
}
int wholeMonths(const QDateTime &past, const QDateTime &now) {
    int months = (now.date().year() - past.date().year()) * 12 + now.date().month() - past.date().month();
    if (past.addMonths(months) > now) {
        --months;
    }
    return months;
}
}
QString WorkflowVersions::relativeTime(const QDateTime &pastTime, const QDateTime &nowTime) {
    const auto ago = [](qint64 count, const QString &singular, const QString &plural) {
        return count == 1 ? QStringLiteral("1 %1 ago").arg(singular) : QStringLiteral("%1 %2 ago").arg(count).arg(plural);
    };
    const auto seconds = pastTime.msecsTo(nowTime) / 1000;
    if (seconds < 1) {
        return QStringLiteral("just now");
    }
    // Months and years follow the calendar, as date-fns does for the web.
    const auto past = pastTime.toLocalTime();
    const auto now = nowTime.toLocalTime();
    const auto months = wholeMonths(past, now);
    if (months >= 12) {
        return ago(months / 12, QStringLiteral("year"), QStringLiteral("years"));
    }
    if (months >= 1) {
        return ago(months, QStringLiteral("month"), QStringLiteral("months"));
    }
    auto days = past.date().daysTo(now.date());
    if (past.addDays(days) > now) {
        --days;
    }
    const auto weeks = days / 7;
    if (weeks >= 1) {
        return ago(weeks, QStringLiteral("week"), QStringLiteral("weeks"));
    }
    if (days >= 1) {
        return ago(days, QStringLiteral("day"), QStringLiteral("days"));
    }
    if (seconds >= 3600) {
        return ago(seconds / 3600, QStringLiteral("hour"), QStringLiteral("hours"));
    }
    if (seconds >= 60) {
        return ago(seconds / 60, QStringLiteral("min"), QStringLiteral("min"));
    }
    return ago(seconds, QStringLiteral("sec"), QStringLiteral("sec"));
}
QString WorkflowVersions::absoluteTime(const QDateTime &time) {
    if (!time.isValid()) {
        return QStringLiteral("—");
    }
    const auto local = time.toLocalTime();
    const QLocale locale;
    return locale.toString(local.date(), QStringLiteral("MMM d, yyyy")) + QStringLiteral(", ") + locale.toString(local.time(), QLocale::ShortFormat);
}
QString WorkflowVersions::saveType(const QVariantMap &row) {
    const auto declared = row.value("save_type").toString();
    if (QStringList{"manual", "autosave", "checkpoint", "restore"}.contains(declared)) {
        return declared;
    }
    const auto name = row.value("name").toString().toLower();
    if (name.isEmpty()) {
        return QStringLiteral("autosave");
    }
    for (const auto &type : {QStringLiteral("manual"), QStringLiteral("checkpoint"), QStringLiteral("restore")}) {
        if (name.contains(type)) {
            return type;
        }
    }
    return QStringLiteral("autosave");
}
QString WorkflowVersions::relativeLabel(const QString &iso, qint64 clock) const {
    const auto past = parseTimestamp(iso);
    if (!past.isValid()) {
        return tr("Time unavailable");
    }
    return relativeTime(past, QDateTime::fromMSecsSinceEpoch(clock, QTimeZone::UTC));
}
QString WorkflowVersions::absoluteLabel(const QString &iso) const {
    return absoluteTime(parseTimestamp(iso));
}
void WorkflowVersions::copyText(const QString &text) {
    QGuiApplication::clipboard()->setText(text);
    m_copied = text;
    m_copiedTimer.start();
    emit copiedChanged();
}
void WorkflowVersions::setClockSource(std::function<QDateTime()> source) {
    m_now = std::move(source);
    tickClock();
}
void WorkflowVersions::setClockInterval(int milliseconds) {
    m_clockInterval = milliseconds;
    scheduleClock();
}
void WorkflowVersions::tickClock() {
    m_clock = m_now().toMSecsSinceEpoch();
    emit clockChanged();
    scheduleClock();
}
void WorkflowVersions::scheduleClock() {
    if (m_rows.isEmpty()) {
        m_clockTimer.stop();
        return;
    }
    if (m_clockInterval > 0) {
        m_clockTimer.start(m_clockInterval);
        return;
    }
    // Labels count seconds for the first minute, then minutes.
    qint64 youngest = std::numeric_limits<qint64>::max();
    for (const auto &row : m_rows) {
        const auto created = parseTimestamp(row.toMap().value("created_at").toString());
        if (created.isValid()) {
            youngest = std::min(youngest, created.msecsTo(QDateTime::fromMSecsSinceEpoch(m_clock, QTimeZone::UTC)));
        }
    }
    m_clockTimer.start(youngest < 60000 ? 1000 : 15000);
}
void WorkflowVersions::selectVersionId(const QString &id) {
    for (int index = 0; index < m_rows.size(); ++index) {
        if (m_rows[index].toMap().value("id").toString() == id) {
            inspect(index);
            return;
        }
    }
}
void WorkflowVersions::createVersion(const QString &name) {
    if (!available()) {
        m_error = tr("Save this local workflow to a server first.");
        emit changed();
        return;
    }
    if (m_busy) {
        return;
    }
    if (m_document->isReadOnly() || m_session->conflictPending() || m_session->saving()) {
        m_error = tr("Resolve server sync before saving a version.");
        emit changed();
        return;
    }
    const auto title = name.trimmed();
    const auto submit = [this, title] {
        QJsonObject input;
        if (!title.isEmpty()) {
            input.insert("name", title);
        }
        request("versions.create", input, true, [this](QJsonObject data) {
            if (data["id"].toString().isEmpty() || !data["version"].isDouble()) {
                m_error = tr("Invalid server response");
                return;
            }
            m_selectAfterLoad = data["id"].toString();
            reloadIfShowing("versions");
        });
    };
    m_session->flushDocumentNotification();
    if (!m_session->dirty()) {
        submit();
        return;
    }
    // The server snapshots its own row, so local edits must reach it first.
    m_busy = true;
    m_error.clear();
    emit changed();
    const auto epoch = m_epoch;
    // native-rules #1: shared_ptr<QList<Connection>> shared by lambda copies, no justification comment
    auto links = std::make_shared<QList<QMetaObject::Connection>>();
    const auto release = [this, links] {
        for (const auto &link : *links) {
            disconnect(link);
        }
    };
    links->append(connect(m_session, &WorkflowSession::saved, this, [this, epoch, release, submit] {
        release();
        if (epoch != m_epoch) {
            return;
        }
        m_busy = false;
        emit changed();
        submit();
    }));
    links->append(connect(m_session, &WorkflowSession::errorOccurred, this, [this, epoch, release](const QString &) {
        release();
        if (epoch != m_epoch) {
            return;
        }
        m_busy = false;
        emit changed();
    }));
    m_session->save();
}
namespace {
// Items in first-seen order with the last duplicate's value, as a JavaScript Map keeps them.
struct OrderedItems {
    QStringList order;
    QHash<QString, QJsonObject> items;
    void insert(const QString &key, const QJsonObject &item)
    {
        if (!items.contains(key)) {
            order.append(key);
        }
        items.insert(key, item);
    }
};

QString edgeKey(const QJsonObject &edge)
{
    const auto handle = [&edge](const char *name) {
        const auto value = edge[QLatin1String(name)].toString();
        return value.isEmpty() ? QStringLiteral("default") : value;
    };
    const QJsonArray parts{edge["source"], handle("sourceHandle"), edge["target"], handle("targetHandle")};
    return QString::fromUtf8(QJsonDocument(parts).toJson(QJsonDocument::Compact));
}

OrderedItems collect(const QJsonObject &graph, bool nodes)
{
    OrderedItems result;
    for (const auto &value : graph[nodes ? "nodes" : "edges"].toArray()) {
        const auto item = value.toObject();
        result.insert(nodes ? item["id"].toString() : edgeKey(item), item);
    }
    return result;
}

// Keys of the first object, then the keys only the second has, each sorted by name.
QStringList keyUnion(const QJsonObject &first, const QJsonObject &second)
{
    QStringList keys = first.keys();
    for (const auto &key : second.keys()) {
        if (!first.contains(key)) {
            keys.append(key);
        }
    }
    return keys;
}

void appendChanges(QVariantList &changes, const QJsonObject &first, const QJsonObject &second)
{
    for (const auto &key : keyUnion(first, second)) {
        if (first[key] != second[key]) {
            changes.append(QVariantMap{{"key", key}, {"oldValue", first[key].toVariant()}, {"newValue", second[key].toVariant()}});
        }
    }
}

QVariantList nodeChanges(const QJsonObject &before, const QJsonObject &after)
{
    QVariantList changes;
    appendChanges(changes, before["data"].toObject(), after["data"].toObject());
    appendChanges(changes, before["dynamic_properties"].toObject(), after["dynamic_properties"].toObject());
    appendChanges(changes, {{"parent_id", before["parent_id"]}}, {{"parent_id", after["parent_id"]}});
    for (const auto &key : {"dynamic_inputs", "dynamic_outputs"}) {
        appendChanges(changes, {{key, before[key].toObject()}}, {{key, after[key].toObject()}});
    }
    // Selection and stacking order are saved with the node but are not edits.
    auto layoutBefore = before["ui_properties"].toObject();
    auto layoutAfter = after["ui_properties"].toObject();
    for (const auto &key : {"selected", "zIndex"}) {
        layoutBefore.remove(key);
        layoutAfter.remove(key);
    }
    appendChanges(changes, {{"ui_properties", layoutBefore}}, {{"ui_properties", layoutAfter}});
    return changes;
}
}

QVariantMap WorkflowVersions::graphDiff(const QJsonObject &oldGraph, const QJsonObject &newGraph)
{
    QVariantMap result;
    bool any = false;
    for (const bool nodes : {true, false}) {
        const QString kind = nodes ? QStringLiteral("Nodes") : QStringLiteral("Edges");
        const auto before = collect(oldGraph, nodes);
        const auto after = collect(newGraph, nodes);
        QVariantList added;
        QVariantList removed;
        QVariantList modified;
        for (const auto &key : after.order) {
            const auto next = after.items.value(key);
            if (!before.items.contains(key)) {
                added.append(next.toVariantMap());
                continue;
            }
            const auto old = before.items.value(key);
            QVariantList changes;
            if (nodes) {
                changes = nodeChanges(old, next);
            } else {
                appendChanges(changes, old, next);
            }
            if (!changes.isEmpty()) {
                modified.append(QVariantMap{{"id", key}, {"type", next["type"].toString()}, {"changes", changes}});
            }
        }
        for (const auto &key : before.order) {
            if (!after.items.contains(key)) {
                removed.append(before.items.value(key).toVariantMap());
            }
        }
        result.insert("added" + kind, added);
        result.insert("removed" + kind, removed);
        result.insert("modified" + kind, modified);
        any = any || !added.isEmpty() || !removed.isEmpty() || !modified.isEmpty();
    }
    result.insert("hasChanges", any);
    return result;
}

QVariantMap WorkflowVersions::comparison() const
{
    if (m_diffValid) {
        return m_diff;
    }
    const auto inspected = m_selected["graph"].toObject();
    auto before = m_document->graph();
    auto after = inspected;
    int oldVersion = 0;
    int newVersion = m_selected["version"].toInt();
    if (m_compareIndex >= 0 && m_compareIndex < m_rows.size()) {
        const auto other = QJsonObject::fromVariantMap(m_rows[m_compareIndex].toMap());
        // The web compares the lower version number with the higher one (VersionHistoryPanel.tsx, `diff`).
        if (other["version"].toInt() > newVersion) {
            before = inspected;
            after = other["graph"].toObject();
            oldVersion = newVersion;
            newVersion = other["version"].toInt();
        } else {
            before = other["graph"].toObject();
            oldVersion = other["version"].toInt();
        }
    }
    m_diff = graphDiff(before, after);
    m_diff.insert("oldGraph", before.toVariantMap());
    m_diff.insert("newGraph", after.toVariantMap());
    // Version 0 stands for the current document.
    m_diff.insert("oldVersion", oldVersion);
    m_diff.insert("newVersion", newVersion);
    m_diffValid = true;
    return m_diff;
}

void WorkflowVersions::deselect()
{
    m_selectedIndex = -1;
    m_compareIndex = -1;
    m_selected = {};
    m_preview.clear();
    emit changed();
}

void WorkflowVersions::reloadIfShowing(const QString &kind)
{
    // Queued so the reply that triggered it finishes first. A panel opened meanwhile owns the data.
    QMetaObject::invokeMethod(this, [this, kind] {
        if (m_panel == kind) {
            load(kind);
        }
    }, Qt::QueuedConnection);
}

void WorkflowVersions::deleteSelected() {
 if (m_selected.isEmpty()) { return; }
 request("versions.delete", {{"version_id",m_selected["id"]}}, true, [this](QJsonObject) { reloadIfShowing("versions"); });
}
WorkflowVersions::WorkflowVersions(WorkflowSession *session, WorkflowDocument *document, QObject *parent)
 : QObject(parent), m_session(session), m_document(document), m_network(this) {
 connect(this, &WorkflowVersions::changed, this, [this] { m_diffValid = false; });
 m_clockTimer.setSingleShot(true);
 connect(&m_clockTimer, &QTimer::timeout, this, &WorkflowVersions::tickClock);
 m_copiedTimer.setSingleShot(true);
 m_copiedTimer.setInterval(2000);
 connect(&m_copiedTimer, &QTimer::timeout, this, [this] { m_copied.clear(); emit copiedChanged(); });
 m_clock = m_now().toMSecsSinceEpoch();
 connect(session, &WorkflowSession::credentialsChanged, this, [this](QUrl origin, QString token, QString user) {
  reset(); m_origin = origin; m_token = token; m_user = user;
  m_network.clearAccessCache(); m_network.setCookieJar(new QNetworkCookieJar(&m_network));
 });
 connect(session, &WorkflowSession::stateChanged, this, [this] {
  const auto id = available() ? m_session->workflow()["id"].toString() : QString{};
  if (id != m_id) { reset(); m_id = id; }
  emit changed();
 });
 connect(session, &WorkflowSession::workflowOpened, this, [this] { reset(); m_id = available() ? m_session->workflow()["id"].toString() : QString{}; });
 connect(document, &WorkflowDocument::changed, this, &WorkflowVersions::changed);
 connect(session, &WorkflowSession::errorOccurred, this, [this](const QString &error) { m_error = error; emit changed(); });
}
void WorkflowVersions::reset() { ++m_epoch; m_selectAfterLoad.clear(); m_pendingLoad.clear(); m_clockTimer.stop(); for (auto *reply : m_network.findChildren<QNetworkReply *>()) { reply->abort(); } m_busy = false; m_rows.clear(); m_selectedIndex = -1; m_compareIndex = -1; m_selected = {}; m_preview.clear(); m_error.clear(); emit changed(); }
void WorkflowVersions::request(const QString &procedure, QJsonObject input, bool mutation, std::function<void(QJsonObject)> done) {
 if (m_busy) { return; }
 if (!available()) { m_error = tr("Save this local workflow to a server first."); emit changed(); return; }
 input.insert("id", m_id);
 QUrl url = m_origin.resolved(QUrl("/trpc/workflows." + procedure));
 if (!mutation) { QUrlQuery query; query.addQueryItem("input", QString::fromUtf8(QJsonDocument(input).toJson(QJsonDocument::Compact))); url.setQuery(query); }
 QNetworkRequest req(url); req.setTransferTimeout(30000);
 req.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
 req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
 if (!m_token.isEmpty()) { req.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
 req.setRawHeader("x-user-id", m_user.toUtf8());
 m_busy = true; m_error.clear(); emit changed();
 auto *reply = mutation ? m_network.post(req, QJsonDocument(input).toJson(QJsonDocument::Compact)) : m_network.get(req);
 const auto epoch = m_epoch;
 connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, done] {
  reply->deleteLater(); if (epoch != m_epoch) { return; }
  const auto body = QJsonDocument::fromJson(reply->readAll()).object();
  if (reply->error() != QNetworkReply::NoError || body.contains("error")) {
   m_error = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt() == 403 ? tr("Permission denied. Versions require editor access and sharing requires ownership.") : tr("Server request failed: ") + (body.contains("error") ? QString::fromUtf8(QJsonDocument(body).toJson(QJsonDocument::Compact)) : reply->errorString());
  } else if (!body.value("result").toObject().contains("data")) { m_error = tr("Invalid server response"); }
  else { done(body["result"].toObject()["data"].toObject()); }
  m_busy = false; emit changed();
  // A panel opened while this request ran asked for its own data. Fetch it now.
  if (!m_pendingLoad.isEmpty()) { load(std::exchange(m_pendingLoad, QString{})); }
 });
}
void WorkflowVersions::load(const QString &kind) {
 m_panel = kind;
 m_rows.clear(); m_selectedIndex = -1; m_compareIndex = -1; m_selected = {}; m_preview.clear();
 m_pendingLoad.clear();
 if (kind == "metadata") { m_error = available() ? QString{} : tr("Save this local workflow to a server first."); emit changed(); return; }
 if (m_busy) { m_pendingLoad = kind; emit changed(); return; }
 request(kind == "sharing" ? "sharing.get" : "versions.list", {}, false, [this, kind](QJsonObject data) {
  // The reply is for a panel that is no longer shown. Its data must not replace the current panel's.
  if (m_panel != kind) { return; }
  if (kind == "sharing") {
   for (const auto &entry : data["shares"].toArray()) { auto row = entry.toObject(); if (row["revoked_at"].isNull() || !row.contains("revoked_at")) { row.insert("kind", "link"); row.insert("url", m_origin.resolved(QUrl((row["role"].toString() == "public" ? "/view/" : "/share/") + row["token"].toString())).toString()); m_rows.append(row.toVariantMap()); } }
   for (const auto &entry : data["collaborators"].toArray()) { auto row = entry.toObject(); row.insert("kind", "collaborator"); m_rows.append(row.toVariantMap()); }
  }
  else {
   for (const auto &entry : data["versions"].toArray()) {
    auto row = entry.toObject().toVariantMap();
    row.insert("size_bytes", QJsonDocument(entry.toObject()["graph"].toObject()).toJson(QJsonDocument::Compact).size());
    const auto type = saveType(row);
    row.insert("save_type", type);
    row.insert("save_label", type == "autosave" ? tr("Auto") : type == "restore" ? tr("Restored") : type == "checkpoint" ? tr("Checkpoint") : tr("Manual"));
    m_rows.append(row);
   }
   tickClock();
   if (!m_selectAfterLoad.isEmpty()) {
    const auto id = m_selectAfterLoad;
    m_selectAfterLoad.clear();
    selectVersionId(id);
   }
  }
 });
}
void WorkflowVersions::inspect(int index) {
 if (index < 0 || index >= m_rows.size()) { return; }
 m_selectedIndex = index; m_selected = QJsonObject::fromVariantMap(m_rows[index].toMap());
 m_preview = QString::fromUtf8(QJsonDocument(m_selected["graph"].toObject()).toJson()); emit changed();
}
void WorkflowVersions::restore(bool confirmDirty) {
 if (m_selected.isEmpty() || m_session->saving() || m_session->conflictPending() || m_document->isReadOnly()) { m_error = tr("Resolve server sync before restoring."); emit changed(); return; }
 if (m_session->dirty() && !confirmDirty) { m_error = tr("Unsaved work: confirm replacement. Undo retains the current graph."); emit changed(); return; }
 const auto before = m_document->snapshot();
 const bool autosave = m_session->autosaveEnabled(); m_session->setAutosaveEnabled(false);
 const auto epoch = m_epoch;
 m_session->setVersionRestoreBusy(true);
 request("versions.restore", {{"version", m_selected["version"]}}, true, [this, before](QJsonObject data) {
  if (m_document->snapshot() != before) { m_error = tr("Document changed during restore. Compare server sync before continuing."); m_session->refreshRemoteWorkflow(); return; }
  if (data["id"] != before["id"] || data["updated_at"].toString().isEmpty() || !data["graph"].isObject()) { m_error = tr("Invalid restore response. Local work is preserved."); return; }
  const auto result = m_document->applyCommand({{"op", "replaceGraph"}, {"graph", data["graph"]}}, tr("Restore workflow version"));
  if (!result) { m_error = result.error; m_session->refreshRemoteWorkflow(); return; }
  m_session->acknowledgeRestoredVersion(data);
 });
 // Keep autosave paused through the request. Restore the preference on completion.
 // native-rules #1: shared_ptr<Connection> shared by lambda copies, no justification comment
 auto connection = std::make_shared<QMetaObject::Connection>();
 *connection = connect(this, &WorkflowVersions::changed, this, [this, autosave, epoch, connection] {
  if (m_busy) { return; } disconnect(*connection);
  if (epoch != m_epoch) { return; }
  m_session->setVersionRestoreBusy(false); m_session->setAutosaveEnabled(autosave);
 });
}
void WorkflowVersions::sharingAction(const QString &procedure, const QVariantMap &input) {
 if (procedure != "revokeLink" && procedure != "setRole" && procedure != "removeCollaborator") { return; }
 request("sharing." + procedure, QJsonObject::fromVariantMap(input), true, [this](QJsonObject) { reloadIfShowing("sharing"); });
}
void WorkflowVersions::createLink(const QString &role) {
 if (role != "viewer" && role != "editor" && role != "public") { return; }
 request("sharing.createLink", {{"role", role}}, true, [this](QJsonObject data) {
        // The web copies a new link at once and keeps it copyable from the list.
        copyText(m_origin.resolved(QUrl((data["role"].toString() == "public" ? "/view/" : "/share/") + data["token"].toString())).toString());
        reloadIfShowing("sharing");
    });
}
void WorkflowVersions::saveMetadata(const QVariantMap &patch) {
 if (!available() || m_busy || m_session->saving() || m_session->conflictPending()) { m_error = tr("Server workflow is unavailable or needs sync."); emit changed(); return; }
 if (patch.contains("name") && patch["name"].toString().trimmed().isEmpty()) { m_error = tr("Enter a workflow name."); emit changed(); return; }
 if (patch.contains("run_mode") && !QStringList{"workflow", "chat", "app", "tool"}.contains(patch["run_mode"].toString())) { m_error = tr("Run mode must be workflow, chat, app or tool."); emit changed(); return; }
 m_error.clear();
 auto snapshot = m_document->snapshot();
 for (const auto &key : {"name", "description", "tags", "run_mode", "workspace_id", "tool_name"}) {
  if (patch.contains(key)) {
   auto value = QJsonValue::fromVariant(patch[key]);
   if (QString(key) == "tool_name") { value = patch[key].toString().remove(QRegularExpression("[^A-Za-z0-9_]")); }
   if (QString(key) == "workspace_id" && patch[key].toString().isEmpty()) { value = QJsonValue::Null; }
   snapshot.insert(key, value);
  }
 }
 m_document->reconcileMetadata(snapshot); m_session->save();
}
}
