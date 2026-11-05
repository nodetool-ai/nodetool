#include "WorkflowVersions.h"
#include <QJsonDocument>
#include <QHash>
#include <QSet>
#include <QNetworkReply>
#include <QNetworkCookieJar>
#include <QUrlQuery>
#include <QRegularExpression>
namespace nodetool::node_editor {
QVariantMap WorkflowVersions::graphDiff(const QJsonObject &oldGraph, const QJsonObject &newGraph) {
 QVariantMap result;
 bool any = false;
 for (const auto &kind : {QString("Nodes"), QString("Edges")}) {
  const bool nodes = kind == "Nodes";
  auto key = [nodes](QJsonObject item) {
   if (nodes) { return item["id"].toString(); }
   QJsonArray parts{item["source"], item["sourceHandle"].toString("default"), item["target"], item["targetHandle"].toString("default")};
   return QString::fromUtf8(QJsonDocument(parts).toJson(QJsonDocument::Compact));
  };
  QHash<QString,QJsonObject> oldItems, newItems;
  for (auto value : oldGraph[kind.toLower()].toArray()) { auto item = value.toObject(); oldItems.insert(key(item), item); }
  for (auto value : newGraph[kind.toLower()].toArray()) { auto item = value.toObject(); newItems.insert(key(item), item); }
  QVariantList added, removed, modified;
  for (auto it = newItems.cbegin(); it != newItems.cend(); ++it) {
   if (!oldItems.contains(it.key())) { added.append(it.value().toVariantMap()); continue; }
   const auto old = oldItems.value(it.key()), next = it.value();
   QVariantList changes;
   auto fields = [&changes](QJsonObject a, QJsonObject b) {
    QSet<QString> keys;
    for (auto it = a.begin(); it != a.end(); ++it) { keys.insert(it.key()); }
    for (auto it = b.begin(); it != b.end(); ++it) { keys.insert(it.key()); }
    for (const auto &k : keys) { if (a[k] != b[k]) { changes.append(QVariantMap{{"key",k},{"oldValue",a[k].toVariant()},{"newValue",b[k].toVariant()}}); } }
   };
   if (nodes) {
    fields(old["data"].toObject(), next["data"].toObject());
    fields(old["dynamic_properties"].toObject(), next["dynamic_properties"].toObject());
    fields({{"parent_id", old["parent_id"].isNull() ? QJsonValue{} : old["parent_id"]}}, {{"parent_id", next["parent_id"].isNull() ? QJsonValue{} : next["parent_id"]}});
    for (const auto &k : {"dynamic_inputs","dynamic_outputs"}) { fields({{k,old[k].toObject()}},{{k,next[k].toObject()}}); }
    auto a = old["ui_properties"].toObject(), b = next["ui_properties"].toObject();
    for (const auto &k : {"selected","zIndex"}) { a.remove(k); b.remove(k); }
    fields({{"ui_properties",a}},{{"ui_properties",b}});
   } else { fields(old,next); }
   if (!changes.isEmpty()) { modified.append(QVariantMap{{"id",it.key()},{"type",next["type"].toString()},{"changes",changes}}); }
  }
  for (auto it = oldItems.cbegin(); it != oldItems.cend(); ++it) { if (!newItems.contains(it.key())) { removed.append(it.value().toVariantMap()); } }
  result.insert("added"+kind,added); result.insert("removed"+kind,removed); result.insert("modified"+kind,modified);
  any = any || !added.isEmpty() || !removed.isEmpty() || !modified.isEmpty();
 }
 result.insert("hasChanges",any); return result;
}
QVariantMap WorkflowVersions::comparison() const {
 if (m_diffValid) { return m_diff; }
 const auto other = m_compareIndex >= 0 && m_compareIndex < m_rows.size() ? QJsonObject::fromVariantMap(m_rows[m_compareIndex].toMap())["graph"].toObject() : m_document->graph();
 m_diff = graphDiff(other, m_selected["graph"].toObject()); m_diffValid = true; return m_diff;
}
void WorkflowVersions::deleteSelected() {
 if (m_selected.isEmpty()) { return; }
 request("versions.delete", {{"version_id",m_selected["id"]}}, true, [this](QJsonObject) { QMetaObject::invokeMethod(this, [this] { load("versions"); }, Qt::QueuedConnection); });
}
WorkflowVersions::WorkflowVersions(WorkflowSession *session, WorkflowDocument *document, QObject *parent)
 : QObject(parent), m_session(session), m_document(document), m_network(this) {
 connect(this, &WorkflowVersions::changed, this, [this] { m_diffValid = false; });
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
void WorkflowVersions::reset() { ++m_epoch; for (auto *reply : m_network.findChildren<QNetworkReply *>()) { reply->abort(); } m_busy = false; m_rows.clear(); m_selectedIndex = -1; m_compareIndex = -1; m_selected = {}; m_preview.clear(); m_error.clear(); emit changed(); }
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
 });
}
void WorkflowVersions::load(const QString &kind) {
 m_rows.clear(); m_selectedIndex = -1; m_compareIndex = -1; m_selected = {}; m_preview.clear();
 if (kind == "metadata") { m_error = available() ? QString{} : tr("Save this local workflow to a server first."); emit changed(); return; }
 request(kind == "sharing" ? "sharing.get" : "versions.list", {}, false, [this, kind](QJsonObject data) {
  if (kind == "sharing") {
   m_preview = QString::fromUtf8(QJsonDocument(data).toJson());
   for (const auto &entry : data["shares"].toArray()) { auto row = entry.toObject(); if (row["revoked_at"].isNull() || !row.contains("revoked_at")) { row.insert("kind", "link"); row.insert("url", m_origin.resolved(QUrl((row["role"].toString() == "public" ? "/view/" : "/share/") + row["token"].toString())).toString()); m_rows.append(row.toVariantMap()); } }
   for (const auto &entry : data["collaborators"].toArray()) { auto row = entry.toObject(); row.insert("kind", "collaborator"); m_rows.append(row.toVariantMap()); }
  }
  else {
   for (const auto &entry : data["versions"].toArray()) {
    auto row = entry.toObject().toVariantMap();
    row.insert("size_bytes", QJsonDocument(entry.toObject()["graph"].toObject()).toJson(QJsonDocument::Compact).size());
    m_rows.append(row);
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
 auto connection = std::make_shared<QMetaObject::Connection>();
 *connection = connect(this, &WorkflowVersions::changed, this, [this, autosave, epoch, connection] {
  if (m_busy) { return; } disconnect(*connection);
  if (epoch != m_epoch) { return; }
  m_session->setVersionRestoreBusy(false); m_session->setAutosaveEnabled(autosave);
 });
}
void WorkflowVersions::sharingAction(const QString &procedure, const QVariantMap &input) {
 if (procedure != "revokeLink" && procedure != "setRole" && procedure != "removeCollaborator") { return; }
 request("sharing." + procedure, QJsonObject::fromVariantMap(input), true, [this](QJsonObject) { QMetaObject::invokeMethod(this, [this] { load("sharing"); }, Qt::QueuedConnection); });
}
void WorkflowVersions::createLink(const QString &role) {
 if (role != "viewer" && role != "editor" && role != "public") { return; }
 request("sharing.createLink", {{"role", role}}, true, [this](QJsonObject data) { m_preview = m_origin.resolved(QUrl((data["role"].toString() == "public" ? "/view/" : "/share/") + data["token"].toString())).toString(); });
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
