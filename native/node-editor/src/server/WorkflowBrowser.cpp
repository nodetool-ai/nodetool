#include "WorkflowBrowser.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
#include <QSet>

namespace nodetool::node_editor {
WorkflowBrowser::WorkflowBrowser(QObject *parent) : QObject(parent), m_network(this) {}
void WorkflowBrowser::cancel() {
  ++m_epoch;
  for (auto reply : m_network.findChildren<QNetworkReply *>()) { reply->abort(); }
  m_loading = false;
  m_projectsLoading = false;
  m_busy = false;
}
void WorkflowBrowser::configure(const QUrl &origin, const QString &token, const QString &userId) {
  cancel();
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));
  m_origin = QUrl{};
  m_token.clear();
  m_user.clear();
  m_project.clear();
  m_search.clear();
  m_rows = {};
  m_projects = {};
  m_next.clear();
  m_error.clear();
  if (origin.isEmpty()) { emit changed(); return; }
  if ((origin.scheme() != "http" && origin.scheme() != "https") || origin.host().isEmpty() ||
      !origin.userInfo().isEmpty() || origin.hasQuery() || origin.hasFragment() ||
      (!origin.path().isEmpty() && origin.path() != "/")) {
    fail(tr("Enter an HTTP or HTTPS server origin without credentials or a path"));
    return;
  }
  if (!token.isEmpty() && origin.scheme() == "http" && origin.host() != "localhost" &&
      origin.host() != "127.0.0.1" && origin.host() != "::1") {
    fail(tr("Authentication requires HTTPS for remote servers"));
    return;
  }
  m_origin = origin;
  m_token = token;
  m_user = userId;
  emit changed();
}
QVariantList WorkflowBrowser::rows() const {
  QVariantList result;
  for (const auto &row : m_rows) {
    if (row.toObject().value("name").toString().contains(m_search, Qt::CaseInsensitive)) {
      result.append(row.toObject().toVariantMap());
    }
  }
  return result;
}
void WorkflowBrowser::setSearch(const QString &text) {
  if (m_search == text) { return; }
  m_search = text;
  emit changed();
}
void WorkflowBrowser::setProjectId(const QString &id) {
  if (m_project == id) { return; }
  cancel();
  m_project = id;
  m_rows = {};
  m_next.clear();
  refresh();
}
void WorkflowBrowser::fail(const QString &message) {
  m_error = message;
  m_loading = false;
  m_projectsLoading = false;
  m_busy = false;
  emit changed();
}
void WorkflowBrowser::request(const QByteArray &method, const QString &path,
                              const QJsonObject &body, Result done) {
  if (m_origin.isEmpty()) { fail(tr("Connect to a server first")); return; }
  QNetworkRequest request(m_origin.resolved(QUrl(path)));
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  if (!m_token.isEmpty()) { request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8()); }
  request.setRawHeader("x-user-id", m_user.toUtf8());
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto reply = m_network.sendCustomRequest(request, method,
      method == "GET" || method == "DELETE" ? QByteArray{} : QJsonDocument(body).toJson(QJsonDocument::Compact));
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 32 * 1024 * 1024) { reply->abort(); }
  });
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, done = std::move(done)] {
    reply->deleteLater();
    if (epoch != m_epoch) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      fail(tr("Server request failed (HTTP %1)").arg(status));
      return;
    }
    if (status == 204) { done(QJsonObject{}); return; }
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(reply->readAll(), &error);
    if (error.error != QJsonParseError::NoError || !document.isObject()) {
      fail(tr("Server returned an invalid JSON response")); return;
    }
    done(document.object());
  });
}
void WorkflowBrowser::refresh() {
  if (m_busy) { return; }
  cancel();
  page(false);
}
void WorkflowBrowser::loadNext() {
  if (!m_loading && !m_busy && hasNext()) { page(true); }
}
void WorkflowBrowser::page(bool append) {
  if (!append) { m_pageCursors.clear(); }
  m_error.clear(); m_loading = true; emit changed();
  QUrlQuery query;
  query.addQueryItem("limit", "100");
  if (!m_project.isEmpty()) { query.addQueryItem("project_id", m_project); }
  if (append) { query.addQueryItem("cursor", m_next); }
  request("GET", "/api/workflows?" + query.toString(QUrl::FullyEncoded), {}, [this, append](QJsonValue response) {
    const auto object = response.toObject();
    if (!object["workflows"].isArray() || (!object["next"].isNull() && !object["next"].isString())) {
      fail(tr("Server returned an invalid workflow page")); return;
    }
    auto rows = append ? m_rows : QJsonArray{};
    QSet<QString> ids;
    for (const auto &row : rows) { ids.insert(row.toObject()["id"].toString()); }
    for (const auto &row : object["workflows"].toArray()) {
      const auto item = row.toObject();
      if (!item["id"].isString() || item["id"].toString().isEmpty() || !item["name"].isString()) {
        fail(tr("Server returned an invalid workflow row")); return;
      }
      if (!ids.contains(item["id"].toString())) { rows.append(item); ids.insert(item["id"].toString()); }
    }
    const auto next = object["next"].toString();
    if (!next.isEmpty() && m_pageCursors.contains(next)) {
      m_next.clear();
      fail(tr("Server repeated its pagination cursor"));
      return;
    }
    if (!next.isEmpty()) { m_pageCursors.insert(next); }
    m_rows = rows; m_next = next; m_loading = false; emit changed();
  });
}
void WorkflowBrowser::loadProjects() {
  if (m_projectsLoading || m_busy || m_loading) { return; }
  m_projectsLoading = true;
  m_error.clear();
  emit changed();
  request("GET", "/trpc/projects.list?input=%7B%7D", {}, [this](QJsonValue response) {
    const QJsonValue data = response.toObject()["result"].toObject()["data"];
    if (!data.isArray()) { fail(tr("Server returned an invalid project list")); return; }
    for (const auto &row : data.toArray()) {
      if (!row.toObject()["id"].isString() || !row.toObject()["name"].isString()) {
        fail(tr("Server returned an invalid project row")); return;
      }
    }
    m_projects = data.toArray(); m_projectsLoading = false; emit changed();
  });
}
bool WorkflowBrowser::mutationReady(const QString &name) {
  if (m_busy || m_loading || m_projectsLoading) { return false; }
  if (name.trimmed().isEmpty()) { fail(tr("Enter a workflow name")); return false; }
  m_busy = true; m_error.clear(); emit changed(); return true;
}
void WorkflowBrowser::createWorkflow(const QString &name) {
  if (!mutationReady(name)) { return; }
  QJsonObject body{{"name", name.trimmed()}, {"access", "private"},
                   {"graph", QJsonObject{{"nodes", QJsonArray{}}, {"edges", QJsonArray{}}}}};
  if (!m_project.isEmpty()) { body.insert("project_id", m_project); }
  request("POST", "/api/workflows", body, [this](QJsonValue response) {
    const auto id = response.toObject()["id"].toString();
    if (id.isEmpty()) { fail(tr("Server returned an invalid workflow")); return; }
    m_busy = false; emit created(id); refresh();
  });
}
void WorkflowBrowser::renameWorkflow(const QString &id, const QString &name) {
  if (id.isEmpty() || !mutationReady(name)) { return; }
  const auto path = "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id));
  request("GET", path, {}, [this, path, id, name](QJsonValue response) {
    auto body = response.toObject();
    if (body["id"].toString() != id || !body["graph"].isObject() || !body["updated_at"].isString()) {
      fail(tr("Server returned an invalid workflow")); return;
    }
    body.insert("name", name.trimmed());
    body.insert("expected_updated_at", body["updated_at"]);
    request("PUT", path, body, [this, id](QJsonValue) {
      m_busy = false; emit renamed(id); refresh();
    });
  });
}
void WorkflowBrowser::deleteWorkflow(const QString &id) {
  if (id.isEmpty() || !mutationReady()) { return; }
  request("DELETE", "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)), {}, [this, id](QJsonValue) {
    m_busy = false; emit deleted(id); refresh();
  });
}
}
