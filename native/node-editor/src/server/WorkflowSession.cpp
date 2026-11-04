#include "WorkflowSession.h"
#include "MsgPack.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QSet>
#include <QUuid>
namespace nodetool::node_editor {
WorkflowSession::WorkflowSession(QObject *parent)
    : QObject(parent), m_network(this),
      m_socket(QString(), QWebSocketProtocol::VersionLatest, this) {
  m_socket.setMaxAllowedIncomingMessageSize(32 * 1024 * 1024);
  connect(&m_socket, &QWebSocket::connected, this, [this] {
    m_connected = true;
    emit stateChanged();
    reconnectRuns();
  });
  connect(&m_socket, &QWebSocket::disconnected, this, [this] {
    m_connected = false;
    for (auto i = m_runs.begin(); i != m_runs.end(); ++i) {
      if (!i.value()["terminal"].toBool()) {
        i.value().insert("uncertain", true);
      }
    }
    emit stateChanged();
  });
  connect(&m_socket, &QWebSocket::binaryMessageReceived, this,
          &WorkflowSession::receive);
  connect(&m_socket, &QWebSocket::errorOccurred, this,
          [this](QAbstractSocket::SocketError) {
            emit errorOccurred(m_socket.errorString());
          });
}
void WorkflowSession::disconnectFromServer() {
  ++m_epoch;
  ++m_documentEpoch;
  for (auto *r : m_network.findChildren<QNetworkReply *>()) {
    r->abort();
  }
  m_network.clearAccessCache();
  m_network.setCookieJar(new QNetworkCookieJar(&m_network));
  m_socket.abort();
  m_token.clear();
  m_base = QUrl{};
  m_userId.clear();
  m_runs.clear();
  m_workflow = {};
  m_catalog = {};
  m_id.clear();
  m_revision.clear();
  m_connected = false;
  m_dirty = false;
  m_saving = false;
  emit credentialsChanged({}, {});
  emit workflowChanged();
  emit catalogChanged();
  emit stateChanged();
}
void WorkflowSession::connectToServer(const QUrl &base, const QString &token,
                                      const QString &userId) {
  if ((base.scheme() != "http" && base.scheme() != "https") ||
      base.host().isEmpty() || !base.userInfo().isEmpty() ||
      !base.query().isEmpty() || !base.fragment().isEmpty()) {
    emit errorOccurred("Enter an HTTP or HTTPS server URL without credentials, "
                       "query or fragment");
    return;
  }
  if (base.scheme() == "http" && !token.isEmpty() &&
      base.host() != "localhost" && base.host() != "127.0.0.1" &&
      base.host() != "::1") {
    emit errorOccurred("Authentication requires HTTPS for remote servers");
    return;
  }
  disconnectFromServer();
  m_base = base;
  m_token = token;
  m_userId = userId;
  emit credentialsChanged(m_base, m_token);
  auto ws = base;
  ws.setScheme(base.scheme() == "https" ? "wss" : "ws");
  ws.setPath("/ws");
  QNetworkRequest req(ws);
  req.setRawHeader("Authorization", "Bearer " + token.toUtf8());
  m_socket.open(req);
  loadCatalog();
}
void WorkflowSession::request(const QByteArray &method, const QString &path,
                              const QJsonObject &body, Callback cb) {
  if (m_base.isEmpty()) {
    cb({}, 0, "Connect to a server first");
    return;
  }
  QNetworkRequest req(m_base.resolved(QUrl(path)));
  req.setTransferTimeout(30000);
  req.setAttribute(QNetworkRequest::RedirectPolicyAttribute,
                   QNetworkRequest::ManualRedirectPolicy);
  req.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
  auto *reply = m_network.sendCustomRequest(
      req, method,
      method == "GET" ? QByteArray{}
                      : QJsonDocument(body).toJson(QJsonDocument::Compact));
  const auto epoch = m_epoch;
  connect(reply, &QNetworkReply::readyRead, this, [reply] {
    if (reply->bytesAvailable() > 32 * 1024 * 1024) {
      reply->abort();
    }
  });
  connect(
      reply, &QNetworkReply::finished, this,
      [this, reply, epoch, cb = std::move(cb)] {
        const auto bytes = reply->readAll();
        const auto status =
            reply->attribute(QNetworkRequest::HttpStatusCodeAttribute).toInt();
        const auto networkError = reply->error();
        reply->deleteLater();
        if (epoch != m_epoch) {
          return;
        }
        QJsonParseError parse;
        auto doc = QJsonDocument::fromJson(bytes, &parse);
        if (networkError != QNetworkReply::NoError || status < 200 ||
            status >= 300) {
          cb({}, status, QString("Request failed (HTTP %1)").arg(status));
          return;
        }
        if (bytes.size() > 32 * 1024 * 1024 ||
            parse.error != QJsonParseError::NoError ||
            (!doc.isObject() && !doc.isArray())) {
          cb({}, status, "Invalid or oversized JSON response");
          return;
        }
        cb(doc.isArray() ? QJsonObject{{"nodes", doc.array()}} : doc.object(),
           status, {});
      });
}
void WorkflowSession::loadCatalog() {
  request("GET", "/api/nodes/metadata?fields=full", {},
          [this](QJsonObject o, int, QString error) {
            if (!error.isEmpty()) {
              emit errorOccurred(error);
              return;
            }
            m_catalog = o;
            emit catalogChanged();
          });
}
void WorkflowSession::openWorkflow(const QString &id) {
  const auto loadEpoch = ++m_loadEpoch;
  const auto epoch = m_documentEpoch;
  const auto edit = m_edit;
  request(
      "GET",
      "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)), {},
      [this, epoch, loadEpoch, edit, id](QJsonObject o, int, QString error) {
        if (epoch != m_documentEpoch || loadEpoch != m_loadEpoch ||
            edit != m_edit) {
          return;
        }
        if (!error.isEmpty()) {
          emit errorOccurred(error);
          return;
        }
        if (o["id"].toString() != id || o["updated_at"].toString().isEmpty() ||
            !o["graph"].isObject()) {
          emit errorOccurred("Invalid workflow response");
          return;
        }
        ++m_documentEpoch;
        m_saving = false;
        m_id = id;
        m_workflow = o;
        m_revision = o["updated_at"].toString();
        m_dirty = false;
        ++m_edit;
        emit workflowOpened();
        emit workflowChanged();
        emit stateChanged();
      });
}
void WorkflowSession::setSnapshot(const QJsonObject &o) {
  if (o == m_workflow) {
    return;
  }
  if (o.value("id") != m_workflow.value("id")) {
    ++m_documentEpoch;
    m_id.clear();
    m_revision.clear();
    m_saving = false;
  }
  m_workflow = o;
  ++m_edit;
  m_dirty = true;
  emit workflowChanged();
  emit stateChanged();
}
void WorkflowSession::save() {
  if (m_saving) {
    return;
  }
  const bool creating = m_id.isEmpty();
  if (!creating &&
      (m_revision.isEmpty() || m_workflow["id"].toString() != m_id)) {
    emit errorOccurred("Reload the workflow revision before saving");
    return;
  }
  auto body = m_workflow;
  body.remove("expected_updated_at");
  if (creating) {
    body.remove("id");
    if (body["name"].toString().isEmpty()) {
      body.insert("name", "New Workflow");
    }
    if (!body.contains("access")) {
      body.insert("access", "private");
    }
  } else {
    body.insert("expected_updated_at", m_revision);
  }
  const auto edit = m_edit, epoch = m_documentEpoch;
  m_saving = true;
  emit stateChanged();
  request(
      creating ? "POST" : "PUT",
      creating ? "/api/workflows"
               : "/api/workflows/" +
                     QString::fromLatin1(QUrl::toPercentEncoding(m_id)),
      body,
      [this, edit, epoch, creating](QJsonObject o, int status, QString error) {
        if (epoch != m_documentEpoch) {
          return;
        }
        m_saving = false;
        if (!error.isEmpty()) {
          if (status == 409) {
            emit saveConflict(m_id);
          }
          emit errorOccurred(error);
        } else if (o["updated_at"].toString().isEmpty() ||
                   o["id"].toString().isEmpty() ||
                   (!creating && o["id"].toString() != m_id)) {
          emit errorOccurred(
              "Save response omitted revision. Reload before saving again");
          m_revision.clear();
        } else {
          m_id = o["id"].toString();
          m_revision = o["updated_at"].toString();
          if (edit == m_edit) {
            m_workflow = o;
            m_dirty = false;
            emit workflowChanged();
          }
          if (creating && edit != m_edit) {
            m_workflow.insert("id", m_id);
            m_workflow.insert("updated_at", m_revision);
            emit workflowChanged();
          }
          emit saved(m_id);
        }
        emit stateChanged();
      });
}
bool WorkflowSession::send(const QString &cmd, const QJsonObject &data) {
  if (!m_connected) {
    emit errorOccurred("Connect before sending a run command");
    return false;
  }
  return m_socket.sendBinaryMessage(encodeMsgPack(QJsonObject{
             {"type", cmd}, {"command", cmd}, {"data", data}})) >= 0;
}
QString WorkflowSession::run(const QJsonObject &snapshot,
                             const QJsonObject &params) {
  if (!m_connected) {
    emit errorOccurred("Connect before running");
    return {};
  }
  for (const auto &run : m_runs) {
    if (run["uncertain"].toBool()) {
      emit errorOccurred(
          "Reconcile disconnected runs before submitting another run");
      return {};
    }
  }
  auto graph = snapshot["graph"].toObject();
  if (!graph["nodes"].isArray() || !graph["edges"].isArray()) {
    emit errorOccurred("Workflow requires a graph with nodes and edges");
    return {};
  }
  QSet<QString> excluded;
  QJsonArray nodes, edges;
  for (const auto &v : graph["nodes"].toArray()) {
    auto n = v.toObject();
    if (n["ui_properties"].toObject()["bypassed"].toBool()) {
      excluded.insert(n["id"].toString());
    } else {
      nodes.append(n);
    }
  }
  for (const auto &v : graph["edges"].toArray()) {
    auto e = v.toObject();
    if (!excluded.contains(e["source"].toString()) &&
        !excluded.contains(e["target"].toString())) {
      edges.append(e);
    }
  }
  const auto id = QUuid::createUuid().toString(QUuid::Id128);
  QJsonObject data{{"type", "run_job_request"},
                   {"job_id", id},
                   {"workflow_id", snapshot["id"]},
                   {"job_name", snapshot["name"]},
                   {"job_type", "workflow"},
                   {"execution_strategy", "threaded"},
                   {"api_url", m_base.toString()},
                   {"user_id", m_userId},
                   {"auth_token", m_token},
                   {"params", params},
                   {"explicit_types", false},
                   {"concurrent", true},
                   {"settings", snapshot["settings"].toObject()},
                   {"graph", QJsonObject{{"nodes", nodes}, {"edges", edges}}}};
  m_runs.insert(id, {{"workflow_id", snapshot["id"]}, {"last_seq", 0}});
  if (!send("run_job", data)) {
    m_runs[id].insert("uncertain", true);
    emit errorOccurred(
        "Run submission uncertain. Reconnect using its job ID before retrying");
  }
  emit runSubmitted(id);
  return id;
}
void WorkflowSession::stop(const QString &id) {
  if (!m_runs.contains(id)) {
    emit errorOccurred("Unknown job ID");
    return;
  }
  send("cancel_job",
       {{"job_id", id}, {"workflow_id", m_runs[id]["workflow_id"]}});
}
void WorkflowSession::reconnectTransport() {
  if (m_base.isEmpty()) {
    emit errorOccurred("Connect to a server first");
    return;
  }
  if (m_socket.state() != QAbstractSocket::UnconnectedState) {
    return;
  }
  auto url = m_base;
  url.setScheme(m_base.scheme() == "https" ? "wss" : "ws");
  url.setPath("/ws");
  QNetworkRequest request(url);
  request.setRawHeader("Authorization", "Bearer " + m_token.toUtf8());
  m_socket.open(request);
}
void WorkflowSession::reconnectRuns() {
  for (auto i = m_runs.begin(); i != m_runs.end(); ++i) {
    QJsonObject d{{"workflow_id", i.value()["workflow_id"]},
                  {"last_seq", i.value()["last_seq"]},
                  {"job_id", i.key()}};
    send("reconnect_job", d);
  }
}
void WorkflowSession::receive(const QByteArray &bytes) {
  auto decoded = decodeMsgPack(bytes);
  if (!decoded || !decoded->isObject()) {
    emit errorOccurred("Invalid MsgPack run event");
    return;
  }
  const auto event = decoded->toObject();
  if (event["type"] == "ping") {
    m_socket.sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "pong"}}));
    return;
  }
  const auto id = event["job_id"].toString();
  if (!m_runs.contains(id)) {
    return;
  }
  auto &run = m_runs[id];
  const auto type = event["type"].toString();
  const auto seq = event["job_seq"].toDouble();
  if (seq > 0 && seq <= run["last_seq"].toDouble()) {
    return;
  }
  if (type == "job_resumed" && event["status"] == "unknown") {
    emit errorOccurred(
        "Server no longer knows this run. Confirm its outcome before retrying");
    emit runEvent(id, event);
    return;
  }
  if (seq > 0 || type == "job_resumed" || type == "job_update") {
    run.insert("uncertain", false);
  }
  if ((type == "job_update" || type == "job_resumed") &&
      (event["status"] == "completed" || event["status"] == "failed" ||
       event["status"] == "cancelled" || event["status"] == "finished")) {
    run.insert("terminal", true);
  }
  if (seq > 0) {
    if (seq <= run["last_seq"].toDouble()) {
      return;
    }
    run.insert("last_seq", seq);
  }
  emit runEvent(id, event);
}
} // namespace nodetool::node_editor
