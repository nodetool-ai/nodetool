#include "ProjectFolder.h"
#include <QDesktopServices>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QUrlQuery>
#include "nodetool/account/qt/ServerToken.h"

namespace nodetool::node_editor {
namespace {
constexpr qint64 ResponseLimit = 16 * 1024 * 1024;
}
ProjectFolder::ProjectFolder(QObject *parent) : QObject(parent), m_network(this) {}
void ProjectFolder::configure(const QUrl &origin, const QString &token, const QString &userId) {
  ++m_epoch;
  for (auto *reply : m_network.findChildren<QNetworkReply *>()) { reply->abort(); }
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));  // m_network owns the jar.
  m_origin = origin;
  m_token = token;
  m_user = userId;
  m_project = {};
  m_file = {};
  m_locateError.clear();
  m_restoreError.clear();
  m_busy = false;
  emit changed();
  refresh();
}
void ProjectFolder::setProject(const QString &projectKey) {
  if (projectKey == m_key) { return; }
  m_key = projectKey;
  ++m_epoch;
  m_project = {};
  m_file = {};
  m_locateError.clear();
  m_restoreError.clear();
  m_busy = false;
  emit changed();
  refresh();
}
void ProjectFolder::setDocument(const QString &workflowId) {
  if (workflowId == m_document) { return; }
  m_document = workflowId;
  m_file = {};
  m_restoreError.clear();
  emit changed();
  loadDocuments();
}
QString ProjectFolder::folderState() const {
  if (m_project.isEmpty()) { return {}; }
  if (!m_project.value("folder").isObject()) { return QStringLiteral("none"); }
  return folder().value("is_accessible").toBool() ? QStringLiteral("ok") : QStringLiteral("missing");
}
bool ProjectFolder::revealable() const {
  // Only a server on this machine names a folder here.
  const auto path = folderPath();
  return folderState() == QLatin1String("ok") && !path.isEmpty() && QFileInfo(path).isDir();
}
QString ProjectFolder::revealLabel() {
#if defined(Q_OS_MACOS)
  return tr("Reveal in Finder");
#elif defined(Q_OS_WIN)
  return tr("Show in File Explorer");
#else
  return tr("Show in file manager");
#endif
}
void ProjectFolder::request(const QByteArray &method, const QString &procedure, const QJsonObject &input, Done done) {
  auto url = m_origin.resolved(QUrl("/trpc/" + procedure));
  const auto body = QJsonDocument(input).toJson(QJsonDocument::Compact);
  if (method == "GET") {
    QUrlQuery query;
    query.addQueryItem("input", QString::fromUtf8(body));
    url.setQuery(query);
  }
  QNetworkRequest request(url);
  request.setTransferTimeout(30000);
  request.setAttribute(QNetworkRequest::RedirectPolicyAttribute, QNetworkRequest::ManualRedirectPolicy);
  nodetool::account::qt::attachServerToken(request, m_origin, m_token);
  if (!m_user.isEmpty()) { request.setRawHeader("x-user-id", m_user.toUtf8()); }
  request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto *reply = method == "GET" ? m_network.get(request) : m_network.post(request, body);
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, reply, [reply] { if (reply->bytesAvailable() > ResponseLimit) { reply->abort(); } });
  connect(reply, &QNetworkReply::finished, this, [this, reply, epoch, done = std::move(done)] {
    reply->deleteLater();
    if (epoch != m_epoch) { return; }
    const auto status = reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
    const auto envelope = QJsonDocument::fromJson(reply->readAll()).object();
    if (reply->error() != QNetworkReply::NoError || status < 200 || status >= 300) {
      auto failure = envelope["error"].toObject();
      if (failure["json"].isObject()) { failure = failure["json"].toObject(); }
      const auto message = failure["message"].toString();
      done({}, message.isEmpty() ? tr("HTTP %1").arg(status) : message);
      return;
    }
    auto data = envelope["result"].toObject()["data"];
    if (data.isObject() && data.toObject().contains("json")) { data = data.toObject()["json"]; }
    done(data, {});
  });
}
void ProjectFolder::refresh() {
  if (m_origin.isEmpty()) { return; }
  const auto epoch = m_epoch;
  request("GET", "projects.list", {}, [this, epoch](QJsonValue data, QString error) {
    if (!error.isEmpty() || !data.isArray() || epoch != m_epoch) { return; }
    // Personal is the row the server marks, as useProjectFolder reads it on the web.
    const auto personal = "personal:" + m_user;
    QJsonObject found;
    for (const auto &value : data.toArray()) {
      const auto row = value.toObject();
      const auto id = row["id"].toString();
      if (m_key.isEmpty() ? (row["isPersonal"].toBool() || id == personal) : id == m_key) {
        found = row;
        break;
      }
    }
    m_project = found;
    emit changed();
    loadDocuments();
  });
}
void ProjectFolder::loadDocuments() {
  const auto project = m_project.value("id").toString();
  if (m_origin.isEmpty() || project.isEmpty() || m_document.isEmpty()) { return; }
  const auto document = m_document;
  const auto epoch = m_epoch;
  request("GET", "projects.documents", {{"id", project}}, [this, epoch, document](QJsonValue data, QString error) {
    if (!error.isEmpty() || !data.isArray() || epoch != m_epoch || document != m_document) { return; }
    QJsonObject file;
    for (const auto &value : data.toArray()) {
      const auto entry = value.toObject();
      if (entry["type"] == "workflow" && entry["ref"].toString() == document) {
        file = entry["file"].toObject();
        break;
      }
    }
    if (file == m_file) { return; }
    m_file = file;
    emit changed();
  });
}
void ProjectFolder::reveal() {
  if (revealable()) { QDesktopServices::openUrl(QUrl::fromLocalFile(folderPath())); }
}
void ProjectFolder::locate(const QUrl &folder) {
  const auto project = m_project.value("id").toString();
  if (m_busy || project.isEmpty() || !folder.isLocalFile()) { return; }
  m_busy = true;
  m_locateError.clear();
  emit changed();
  request("POST", "projects.relocate", {{"project_id", project}, {"path", folder.toLocalFile()}},
          [this](QJsonValue data, QString error) {
    m_busy = false;
    if (!error.isEmpty() || !data.isObject()) {
      m_locateError = tr("Could not locate the folder: %1").arg(error.isEmpty() ? tr("Invalid response") : error);
    } else {
      m_project = data.toObject();
      loadDocuments();
    }
    emit changed();
  });
}
void ProjectFolder::restoreFile() {
  if (m_busy || m_document.isEmpty() || fileState() != QLatin1String("missing")) { return; }
  m_busy = true;
  m_restoreError.clear();
  emit changed();
  const auto document = m_document;
  request("POST", "projects.restoreDocumentFile", {{"type", "workflow"}, {"ref", document}},
          [this, document](QJsonValue data, QString error) {
    m_busy = false;
    if (document == m_document) {
      if (!error.isEmpty() || !data.isObject()) {
        m_restoreError = tr("The file was not restored: %1").arg(error.isEmpty() ? tr("Invalid response") : error);
      } else {
        m_file = data.toObject()["file"].toObject();
      }
    }
    emit changed();
  });
}
void ProjectFolder::documentFileChanged(const QJsonObject &resource) {
  if (m_document.isEmpty() || resource.value("id").toString() != m_document) { return; }
  m_restoreError.clear();
  loadDocuments();
}
}
