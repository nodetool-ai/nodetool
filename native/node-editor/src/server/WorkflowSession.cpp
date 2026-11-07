#include "WorkflowSession.h"
#include "MsgPack.h"
#include "../document/WorkflowMerge.h"
#include <QJsonArray>
#include <QDateTime>
#include <QJsonDocument>
#include <QNetworkCookieJar>
#include <QNetworkReply>
#include <QSet>
#include <algorithm>
#include <utility>
#include <QUuid>
namespace nodetool::node_editor {
WorkflowSession::WorkflowSession(QObject *parent)
    : QObject(parent), m_autosave(this, [this] { flushAutosave(); }), m_history(&m_generations, this), m_network(this),
      m_socket(QString(), QWebSocketProtocol::VersionLatest, this) {
  connect(&m_history, &GenerationHistory::changed, this, &WorkflowSession::generationsChanged);
  m_socket.setMaxAllowedIncomingMessageSize(32 * 1024 * 1024);
  connect(&m_socket, &QWebSocket::connected, this, [this] {
    m_connected = true;
    emit stateChanged();
    reconnectRuns();
    if (m_accountJobs) {
        m_accountJobs->refresh(true);
    }
    if (serverBound()) refreshRemoteWorkflow();
  });
  connect(&m_socket, &QWebSocket::disconnected, this, [this] {
    m_connected = false;
    if (!m_systemStats.isEmpty()) {
      m_systemStats.clear();
      emit systemStatsChanged();
    }
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
void WorkflowSession::setSnapshotProvider(std::function<QJsonObject()> provider) {
    m_snapshotProvider = std::move(provider);
}
QJsonObject WorkflowSession::workflow() const {
    if (m_snapshotProvider && m_snapshotEdit != m_edit) {
        m_workflow = m_snapshotProvider();
        m_snapshotEdit = m_edit;
    }
    return m_workflow;
}
void WorkflowSession::documentChanged() {
    ++m_edit;
    m_dirty = true;
    m_autosaveState = "unsaved";
    if (serverBound() && !m_conflictPending) {
        m_autosave.changed();
    }
    // Presentation may wait for the next turn. The edit counter and dirty
    // state above, and every workflow() read, already reflect this edit.
    if (!m_documentNotificationPending) {
        m_documentNotificationPending = true;
        QTimer::singleShot(0, this, &WorkflowSession::flushDocumentNotification);
    }
}
void WorkflowSession::flushDocumentNotification() {
    if (!m_documentNotificationPending) {
        return;
    }
    m_documentNotificationPending = false;
    emit workflowChanged();
    emit stateChanged();
}
QVariantList WorkflowSession::queue() const {
    QVariantList result;
    QSet<QString> seen;
    auto append = [&](const QString &id, QJsonObject row) {
        row["jobId"] = id;
        row["editedSinceError"] = row.contains("edit") && row["edit"].toDouble() != static_cast<double>(m_edit);
        row["terminal"] = QStringList{"cancelled", "completed", "failed"}.contains(row["status"].toString());
        row["stopping"] = m_accountJobs && m_accountJobs->stopping(id);
        row["local"] = m_runs.contains(id);
        if (row["name"].toString().isEmpty()) {
            const auto current = workflow();
            row["name"] = row["workflow_id"] == current["id"] ? current["name"].toString("Untitled") : "Untitled";
        }
        result.append(row.toVariantMap());
        seen.insert(id);
    };
    if (m_accountJobs) {
        for (const auto &value : m_accountJobs->rows()) {
            auto row = value.toObject();
            const auto id = row["id"].toString();
            if (m_runs.contains(id)) {
                const auto live = m_runs.value(id);
                for (const auto &key : {"status", "queue_position", "error", "uncertain", "order", "edit", "started_at"}) {
                    if (live.contains(key) && (QString::fromLatin1(key) != "started_at" || row["started_at"].isNull())) {
                        row[key] = live[key];
                    }
                }
            }
            append(id, row);
        }
    }
    QStringList local = m_runs.keys();
    std::sort(local.begin(), local.end(), [this](const QString &a, const QString &b) {
        return m_runs[a]["order"].toDouble() > m_runs[b]["order"].toDouble();
    });
    for (const auto &id : local) {
        if (!seen.contains(id)) {
            append(id, m_runs.value(id));
        }
    }
    return result;
}

void WorkflowSession::disconnectFromServer() {
    if (m_accountJobs) {
        disconnect(m_accountJobs.data(), nullptr, this, nullptr);
        m_accountJobs.clear();
    }
  m_autosave.cancel();
  clearConflict();
  m_autosaveState = "saved";
  m_history.configure({}, {}, {});
  m_generations.clear();
  m_runMetadata = {};
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
    ++m_edit;
    m_workflow = {};
    // A host retains its local document across credential changes. Standalone
    // sessions have no document provider and keep the empty snapshot.
    if (!m_snapshotProvider) {
        m_snapshotEdit = m_edit;
    }
  m_persistedWorkflow = {};
  m_catalog = {};
  m_id.clear();
  m_revision.clear();
  m_connected = false;
  m_dirty = false;
  m_saving = false;
  if (!m_systemStats.isEmpty()) {
    m_systemStats.clear();
    emit systemStatsChanged();
  }
  if (!m_reconnecting) {
    emit credentialsChanged({}, {}, {});
  }
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
  // A reconnect reports one change. Tabs share credentials, so an intermediate
  // empty report would disconnect the other tabs.
  m_reconnecting = true;
  disconnectFromServer();
  m_reconnecting = false;
  m_base = base;
  m_token = token;
  m_userId = userId;
    const auto accountEpoch = m_epoch;
    m_accountJobs = AccountJobs::acquire(m_base, m_token, m_userId);
    connect(m_accountJobs.data(), &AccountJobs::changed, this, [this, accountEpoch] {
        if (accountEpoch != m_epoch) {
            return;
        }
        for (const auto &value : m_accountJobs->rows()) {
            const auto row = value.toObject();
            const auto id = row["id"].toString();
            if (m_runs.contains(id) && row["status"] == "cancelled") {
                m_runs[id]["status"] = "cancelled";
                m_runs[id]["terminal"] = true;
            }
        }
        emit stateChanged();
    });
    connect(m_accountJobs.data(), &AccountJobs::cancelled, this, [this, accountEpoch](QString id, QString status) {
        if (accountEpoch != m_epoch) {
            return;
        }
        if (m_runs.contains(id)) {
            m_runs[id]["status"] = status;
            m_runs[id]["terminal"] = QStringList{"cancelled", "failed", "completed"}.contains(status);
            emit stateChanged();
        }
    });
    connect(m_accountJobs.data(), &AccountJobs::errorOccurred, this, &WorkflowSession::errorOccurred);
    m_accountJobs->refresh(true);
  m_history.configure(m_base, m_token, m_userId);
  emit credentialsChanged(m_base, m_token, m_userId);
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
        m_autosave.cancel();
        clearConflict();
        m_autosaveState = "saved";
        m_saving = false;
        m_id = id;
        m_workflow = o;
        m_persistedWorkflow = o;
        m_revision = o["updated_at"].toString();
        m_dirty = false;
        ++m_edit;
        m_snapshotEdit = m_edit;
        m_history.setWorkflow(o);
        m_history.refresh();
        emit workflowOpened();
        emit workflowChanged();
        emit stateChanged();
      });
}
void WorkflowSession::acknowledgeRestoredVersion(const QJsonObject &response) {
    if (response["id"].toString() != m_id || response["updated_at"].toString().isEmpty()) {
        return;
    }
    workflow();
    m_revision = response["updated_at"].toString();
    m_workflow.insert("updated_at", m_revision);
    m_persistedWorkflow = response;
    clearConflict();
    emit workflowChanged();
    emit stateChanged();
}
void WorkflowSession::setSnapshot(const QJsonObject &snapshot) {
    if (snapshot == m_workflow && m_snapshotEdit == m_edit) {
        return;
    }
    if (snapshot.value("id") != m_workflow.value("id")) {
        ++m_documentEpoch;
        m_autosave.cancel();
        clearConflict();
        m_id.clear();
        m_revision.clear();
        m_saving = false;
    }
    m_workflow = snapshot;
    ++m_edit;
    m_snapshotEdit = m_edit;
    m_dirty = true;
    m_autosaveState = "unsaved";
    if (serverBound() && !m_conflictPending) {
        m_autosave.changed();
    }
    emit workflowChanged();
    emit stateChanged();
}
void WorkflowSession::save() {
  if (m_saving) {
    return;
  }
  if (m_remoteLoading) {
    emit errorOccurred("Wait for the remote workflow comparison before saving");
    return;
  }
  if (m_conflictPending) {
    emit errorOccurred("Compare the remote workflow, then reload or keep local before saving");
    return;
  }
    workflow();
  m_autosave.cancel();
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
  m_autosaveState = "saving";
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
          m_autosaveState = "error";
          if (status == 409) {
            m_conflictPending = true;
            m_autosaveState = "conflict";
            refreshRemoteWorkflow();
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
            workflow();
          m_persistedWorkflow = o;
          m_id = o["id"].toString();
          m_revision = o["updated_at"].toString();
          if (edit == m_edit) {
            // Full-save responses may omit extension metadata retained locally.
            for (auto it = o.begin(); it != o.end(); ++it) { m_workflow.insert(it.key(), it.value()); }
            m_dirty = false;
            emit workflowChanged();
          }
          if (creating && edit != m_edit) {
            m_workflow.insert("id", m_id);
            m_workflow.insert("updated_at", m_revision);
            emit workflowChanged();
          }
          if (!m_conflictPending) {
            m_autosaveState = m_dirty ? "unsaved" : "saved";
            if (m_dirty) m_autosave.changed();
          }
          emit saved(m_id);
        }
        emit stateChanged();
        resumeKeepLocal();
        if (m_remoteAgain) { m_remoteAgain = false; refreshRemoteWorkflow(); }
      });
}
void WorkflowSession::detachServerWorkflow() {
  ++m_documentEpoch;
  ++m_loadEpoch;
  m_autosave.cancel();
  clearConflict();
  m_id.clear();
  m_revision.clear();
  m_saving = false;
  m_autosaveState = m_dirty ? "unsaved" : "saved";
  emit stateChanged();
}
void WorkflowSession::setAutosaveEnabled(bool enabled) {
  m_autosave.setEnabled(enabled);
  if (enabled && m_dirty && serverBound() && !m_conflictPending) m_autosave.changed();
  emit stateChanged();
}
void WorkflowSession::flushAutosave() {
  if (!m_autosave.enabled() || !m_dirty || !serverBound() || m_conflictPending) return;
  // An explicit flush waits for the save or remote comparison in flight, then runs.
  if (m_saving || m_remoteLoading) {
    m_flushAgain = true;
    return;
  }
  submitAutosave(false, {});
}
void WorkflowSession::submitAutosave(bool checkpoint, std::function<void(bool)> done) {
  m_flushAgain = false;
  m_autosave.cancel();
    workflow();
  const auto graph = m_workflow["graph"].toObject();
  bool compatible = m_workflow["graph"].isObject() && graph["nodes"].isArray() && graph["edges"].isArray();
  for (auto it = graph.begin(); it != graph.end(); ++it)
    if (it.key() != "nodes" && it.key() != "edges" && it.key() != "links") compatible = false;
  if (graph.contains("links") && !graph["links"].isArray()) compatible = false;
  for (const auto &entry : graph["links"].toArray()) {
    if (!entry.isObject()) { compatible = false; continue; }
    const auto link = entry.toObject();
    for (auto it = link.begin(); it != link.end(); ++it)
      if (it.key() != "id" && it.key() != "source" && it.key() != "target" && it.key() != "label" && it.key() != "kind") compatible = false;
  }
  if (!compatible && checkpoint) {
    // A checkpoint rewrites the graph the way an autosave does, so it has the same limits.
    // The run goes ahead without one.
    if (done) done(true);
    return;
  }
  if (!compatible) {
    m_autosaveState = "error";
    emit errorOccurred("Autosave cannot preserve unsupported graph metadata. Local edits are preserved. Save a local file before editing this document on the server.");
    emit stateChanged();
    return;
  }
  const auto epoch = m_documentEpoch, edit = m_edit;
  const auto id = m_id;
  auto body = QJsonObject{{"id", id}, {"save_type", checkpoint ? "checkpoint" : "autosave"},
    {"force", checkpoint}, {"client_id", "system"}, {"max_versions", 50},
    {"graph", m_workflow["graph"]}, {"expected_updated_at", m_revision}};
  if (checkpoint) body.insert("description", "Before execution");
  const auto sent = m_workflow;
  m_saving = true;
  m_autosaveState = "saving";
  emit stateChanged();
  request("POST", "/trpc/workflows.autosave", body,
    [this, epoch, edit, id, sent, checkpoint, done](QJsonObject response, int status, QString error) {
      if (epoch != m_documentEpoch || id != m_id) {
        if (done) done(false);
        return;
      }
      m_saving = false;
      auto result = response["result"].toObject()["data"].toObject();
      if (result["json"].isObject()) result = result["json"].toObject();
      if (!error.isEmpty()) {
        // The web logs a failed checkpoint and runs anyway. Only a conflict needs the user.
        m_autosaveState = checkpoint ? (m_dirty ? "unsaved" : "saved") : "error";
        // An operation notice already explains the stale revision. Its comparison
        // merges the remote edits, as the web does after a failed autosave.
        const bool merging = status == 409 && !m_pendingOps.isEmpty() && !m_pendingWithoutOps;
        if (merging) {
          m_autosaveState = "unsaved";
          refreshRemoteWorkflow();
        } else if (status == 409) {
          m_conflictPending = true;
          m_autosaveState = "conflict";
          refreshRemoteWorkflow();
          emit saveConflict(id);
        }
        if (!merging && (!checkpoint || status == 409)) emit errorOccurred(error);
      } else if (result["skipped"].toBool() && checkpoint) {
        m_autosaveState = m_dirty ? "unsaved" : "saved";
      } else if (result["skipped"].toBool()) {
        // Rate limiting does not acknowledge our snapshot. Retry after the server window.
        m_autosaveState = "unsaved";
        m_autosave.later(30000);
      } else if (result["updated_at"].toString().isEmpty() || !result.contains("skipped")) {
        m_autosaveState = "error";
        m_revision.clear();
        emit errorOccurred("Autosave response omitted revision. Reopen the remote workflow before saving.");
      } else {
        workflow();
        m_revision = result["updated_at"].toString();
        m_workflow.insert("updated_at", m_revision);
        if (result.contains("etag")) m_workflow.insert("etag", result["etag"]);
        // Autosave only persists these supported fields. Metadata edited by
        // another surface still requires an explicit full save.
        auto unsupported = [](QJsonObject value) {
          for (const auto &key : {"graph", "updated_at", "etag"}) value.remove(key);
          return value;
        };
        const bool fullyPersisted = unsupported(sent) == unsupported(m_persistedWorkflow);
        m_persistedWorkflow["graph"] = sent["graph"];
        m_persistedWorkflow["updated_at"] = m_revision;
        if (edit == m_edit && fullyPersisted) m_dirty = false;
        if (!m_conflictPending) {
          m_autosaveState = m_dirty ? "unsaved" : "saved";
          if (m_dirty && edit != m_edit) {
            if (std::exchange(m_flushAgain, false)) {
              flushAutosave();
            } else {
              m_autosave.changed();
            }
          }
        }
        emit workflowChanged();
        emit saved(id);
      }
      emit stateChanged();
      resumeKeepLocal();
        if (m_remoteAgain) { m_remoteAgain = false; refreshRemoteWorkflow(); }
      if (done) done(true);
    });
}
void WorkflowSession::checkpointBeforeRun(std::function<void(bool)> done) {
  // Mirrors handleRun in web/src/hooks/useFloatingToolbarActions.ts lines 156 to 180: a forced
  // "checkpoint" autosave described "Before execution", skipped for an empty graph, and awaited
  // before the run starts. The web waits only for that one request, and so does this.
  if (!serverBound() || m_conflictPending) {
    done(true);
    return;
  }
  if (m_saving || m_remoteLoading) {
    // The web queues the checkpoint behind a save in flight (queueWorkflowSave), so the token
    // that save leaves is the one the checkpoint sends.
    const auto epoch = m_documentEpoch;
    auto link = std::make_shared<QMetaObject::Connection>();
    *link = connect(this, &WorkflowSession::stateChanged, this, [this, epoch, done, link] {
      if (m_saving || m_remoteLoading) return;
      disconnect(*link);
      if (epoch != m_documentEpoch) {
        done(false);
        return;
      }
      checkpointBeforeRun(done);
    });
    return;
  }
  if (workflow()["graph"].toObject()["nodes"].toArray().isEmpty()) {
    done(true);
    return;
  }
  submitAutosave(true, std::move(done));
}
void WorkflowSession::clearConflict() {
  ++m_remoteEpoch;
  m_remoteWorkflow = {};
  m_conflictPending = false;
  m_remoteLoading = false;
  m_remoteAgain = false;
  m_flushAgain = false;
  m_keepLocalRevision.clear();
  m_mergeConflicts.clear();
  m_pendingOps = {};
  m_pendingWithoutOps = false;
}
void WorkflowSession::refreshRemoteWorkflow() {
  if (m_id.isEmpty()) return;
  if (m_saving || m_remoteLoading) { m_remoteAgain = true; return; }
  const auto epoch = m_documentEpoch, remoteEpoch = ++m_remoteEpoch;
  const auto id = m_id;
  // This comparison consumes the notices received so far. Later notices queue another one.
  const auto ops = std::exchange(m_pendingOps, QJsonArray{});
  const bool withoutOps = std::exchange(m_pendingWithoutOps, false);
  m_remoteLoading = true;
  m_autosave.cancel();
  emit stateChanged();
  request("GET", "/api/workflows/" + QString::fromLatin1(QUrl::toPercentEncoding(id)), {},
    [this, epoch, remoteEpoch, id, ops, withoutOps](QJsonObject remote, int status, QString error) {
      if (epoch != m_documentEpoch || remoteEpoch != m_remoteEpoch || id != m_id) return;
      m_remoteLoading = false;
      if (!error.isEmpty()) {
        // A deleted/unreadable remote must never turn into an unconditional create.
        m_conflictPending = true;
        m_remoteWorkflow = {};
        m_autosaveState = status == 404 ? "deleted" : "error";
        emit errorOccurred(status == 404 ? "Remote workflow was deleted. Local edits are preserved." : error);
      } else if (remote["id"].toString() != id || remote["updated_at"].toString().isEmpty() || !remote["graph"].isObject()) {
        m_conflictPending = true;
        m_autosaveState = "error";
        emit errorOccurred("Invalid remote workflow response. Local edits are preserved.");
      } else if (remote["updated_at"].toString() == m_revision) {
        if (!m_conflictPending && m_dirty) {
          if (std::exchange(m_flushAgain, false)) {
            flushAutosave();
          } else {
            m_autosave.changed();
          }
        }
      } else if (m_dirty && !m_conflictPending && !withoutOps && !ops.isEmpty() && mergeRemoteWorkflow(remote, ops)) {
        // Merged. True conflicts, if any, now wait for review.
      } else if (m_dirty || m_conflictPending) {
        const bool newConflict = !m_conflictPending;
        m_remoteWorkflow = remote;
        m_conflictPending = true;
        m_autosaveState = "conflict";
        if (newConflict) emit saveConflict(id);
      } else {
        m_remoteWorkflow = remote;
        reloadRemoteWorkflow();
      }
      emit stateChanged();
      resumeKeepLocal();
        if (m_remoteAgain) { m_remoteAgain = false; refreshRemoteWorkflow(); }
    });
}
void WorkflowSession::reloadRemoteWorkflow() {
  if (m_remoteWorkflow.isEmpty() || m_remoteWorkflow["id"].toString() != m_id || m_saving) return;
  m_workflow = m_remoteWorkflow;
  m_persistedWorkflow = m_remoteWorkflow;
  m_revision = m_workflow["updated_at"].toString();
  ++m_edit;
    m_snapshotEdit = m_edit;
  ++m_documentEpoch;
  m_dirty = false;
  m_autosave.cancel();
  clearConflict();
  m_autosaveState = "reloaded";
  m_history.setWorkflow(m_workflow);
  m_history.refresh();
  emit workflowOpened();
  emit workflowChanged();
  emit stateChanged();
}
void WorkflowSession::keepLocalWorkflow() {
  if (!m_conflictPending || m_remoteWorkflow.isEmpty()) return;
  // A click during a save or comparison runs when that work ends.
  if (m_remoteLoading || m_saving) {
    m_keepLocalRevision = m_remoteWorkflow["updated_at"].toString();
    return;
  }
  // Explicit user consent advances CAS to the compared remote revision. A newer
  // concurrent write still conflicts on the next save.
  m_revision = m_remoteWorkflow["updated_at"].toString();
  clearConflict();
  m_dirty = true;
  m_autosaveState = "unsaved";
  ++m_edit;
  emit stateChanged();
  save();
}
void WorkflowSession::resumeKeepLocal() {
  if (m_keepLocalRevision.isEmpty()) return;
  const auto revision = std::exchange(m_keepLocalRevision, QString{});
  // The user chose the compared server copy. A newer one needs a new decision.
  if (m_conflictPending && m_remoteWorkflow["updated_at"].toString() == revision) {
    keepLocalWorkflow();
  }
}
void WorkflowSession::externalWorkflowChange(const QJsonObject &event) {
  if (event["resource_type"] != "workflow" || !serverBound()) return;
  const auto resource = event["resource"].toObject();
  if (resource["id"].toString() != m_id) return;
  if (event["event"] == "deleted") {
    clearConflict();
    m_autosave.cancel();
    m_conflictPending = true;
    m_remoteWorkflow = {};
    m_autosaveState = "deleted";
    emit saveConflict(m_id);
    emit stateChanged();
    return;
  }
  if (event["event"] != "updated" && event["event"] != "created") return;
  if (resource["updated_at"].toString() == m_revision) return;
  // A notice without ops is a whole-document replacement (resourceChangeMessageOutSchema).
  const auto ops = event["ops"].toArray();
  if (ops.isEmpty()) {
    m_pendingWithoutOps = true;
  } else {
    for (const auto &op : ops) m_pendingOps.append(op);
  }
  // Notices carry row metadata, never an authoritative editable snapshot.
  refreshRemoteWorkflow();
}
bool WorkflowSession::mergeRemoteWorkflow(const QJsonObject &remote, const QJsonArray &ops) {
  // Mirrors mergeExternalGraph in web/src/stores/WorkflowManagerStore.ts: merge
  // against the last server copy, then roll the base and revision to the remote.
  const auto local = workflow();
  const auto result = mergeWorkflowSnapshots(m_persistedWorkflow, local, remote, ops);
  const auto graph = result.graph["graph"].toObject();
  QVariantList conflicts;
  for (const auto &conflict : result.conflicts) {
    conflicts.append(QVariantMap{{"kind", conflict.kind}, {"id", conflict.id}, {"label", conflict.label},
      {"reason", conflict.reason}, {"remoteDeleted", conflict.external.isNull()}});
  }
  const auto persisted = std::exchange(m_persistedWorkflow, remote);
  const auto revision = std::exchange(m_revision, remote["updated_at"].toString());
  // Set before the host applies the graph, so its edit notification pauses writes.
  if (!conflicts.isEmpty()) {
    m_conflictPending = true;
    m_remoteWorkflow = remote;
    m_mergeConflicts = conflicts;
    m_autosaveState = "conflict";
  }
  if (m_graphApplier && graph != local["graph"].toObject() && !m_graphApplier(graph)) {
    // The document refused the merged graph. Offer the whole-workflow comparison instead.
    m_persistedWorkflow = persisted;
    m_revision = revision;
    m_conflictPending = false;
    m_remoteWorkflow = {};
    m_mergeConflicts.clear();
    return false;
  }
  // The applied edit already holds the graph. Root members and the revision live here.
  auto merged = result.graph;
  if (m_graphApplier) merged["graph"] = workflow()["graph"];
  m_workflow = merged;
  ++m_edit;
  m_snapshotEdit = m_edit;
  m_dirty = true;
  if (m_conflictPending) {
    // The host's edit notification marks the state unsaved. The review still waits.
    m_autosaveState = "conflict";
    emit saveConflict(m_id);
  } else {
    m_autosaveState = "unsaved";
    m_autosave.changed();
  }
  emit workflowChanged();
  return true;
}
bool WorkflowSession::send(const QString &cmd, const QJsonObject &data) {
  if (!m_connected) {
    emit errorOccurred("Connect before sending a run command");
    return false;
  }
  return m_socket.sendBinaryMessage(encodeMsgPack(QJsonObject{
             {"type", cmd}, {"command", cmd}, {"data", data}})) >= 0;
}
QString WorkflowSession::runSelected(const QJsonObject &snapshot,
                                     const QStringList &nodeIds,
                                     const QJsonArray &metadata,
                                     const QJsonObject &params) {
  m_history.setWorkflow(snapshot);
  if (m_history.loading()) { emit errorOccurred("Generation history is loading. Run the selection when loading finishes."); return {}; }
  PartialRunPlanner planner(snapshot, metadata, m_generations.generations(snapshot["id"].toString()), QDateTime::currentMSecsSinceEpoch());
  m_lastPlan = planner.plan(nodeIds);
  if (!m_lastPlan.ok) { emit errorOccurred(m_lastPlan.error); return {}; }
  return submitRun(m_lastPlan.snapshot, params, snapshot, metadata, m_lastPlan.executed);
}
QString WorkflowSession::run(const QJsonObject &snapshot, const QJsonObject &params) {
  m_lastPlan = {};
  QStringList executed;
  for (const auto &value : snapshot["graph"].toObject()["nodes"].toArray()) {
    const auto node = value.toObject();
    if (!node["ui_properties"].toObject()["bypassed"].toBool()) { executed.append(node["id"].toString()); }
  }
  return submitRun(snapshot, params, snapshot, m_runMetadata, executed);
}
QString WorkflowSession::submitRun(const QJsonObject &snapshot, const QJsonObject &params,
                                   const QJsonObject &fullSnapshot, const QJsonArray &metadata,
                                   const QStringList &executed) {
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
  const auto retained = queue();
  qsizetype finished = 0;
  for (const auto &entry : retained) if (entry.toMap()["terminal"].toBool()) ++finished;
  for (const auto &entry : retained) {
    if (finished <= 20) break;
    if (entry.toMap()["terminal"].toBool()) { m_runs.remove(entry.toMap()["jobId"].toString()); --finished; }
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
  m_runs.insert(id, {{"workflow_id", snapshot["id"]}, {"last_seq", 0}, {"status", "starting"}, {"name", snapshot["name"]}, {"edit", static_cast<double>(m_edit)}, {"started_at", QJsonValue::Null}, {"order", static_cast<double>(++m_queueOrder)}});
  m_generations.submitted(id, fullSnapshot, metadata, executed);
  if (!send("run_job", data)) {
    m_runs[id].insert("uncertain", true);
    emit errorOccurred(
        "Run submission uncertain. Reconnect using its job ID before retrying");
  }
    if (m_accountJobs) {
        m_accountJobs->refresh();
    }
  emit runSubmitted(id);
  emit stateChanged();
  return id;
}
void WorkflowSession::stop(const QString &id) {
    if (!m_runs.contains(id)) {
        emit errorOccurred("Unknown job ID");
        return;
    }
    send("cancel_job", {{"job_id", id}, {"workflow_id", m_runs[id]["workflow_id"]}});
}
void WorkflowSession::cancelJob(const QString &id) {
    if (!m_accountJobs || id.isEmpty()) {
        emit errorOccurred("Connect before cancelling a job");
        return;
    }
    m_accountJobs->cancel(id);
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
    // Like resumeInFlightJobs on the web, only runs still in flight resume.
    if (i.value().value("terminal").toBool()) {
      continue;
    }
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
  auto event = decoded->toObject();
  if (event["type"] == "error" && event["node_id"].toString().isEmpty() && !event["job_id"].toString().isEmpty()) {
    event["type"] = "job_update";
    event["status"] = "failed";
    if (event["error"].toString().isEmpty()) event["error"] = event["message"];
  }
  if (event["type"] == "ping") {
    m_socket.sendBinaryMessage(encodeMsgPack(QJsonObject{{"type", "pong"}}));
    return;
  }
  if (event["type"] == "system_stats") {
    m_systemStats = event["stats"].toObject().toVariantMap();
    emit systemStatsChanged();
    return;
  }
  if (event["type"] == "resource_change") {
    if (m_accountJobs && event["resource_type"] == "job") {
        m_accountJobs->refresh();
    }
    externalWorkflowChange(event);
    return;
  }
  const auto id = event["job_id"].toString();
  if (!m_runs.contains(id)) {
    if (m_accountJobs && (event["type"] == "job_update" || event["type"] == "job_resumed")) {
        m_accountJobs->refresh();
    }
    return;
  }
  auto &run = m_runs[id];
  const auto type = event["type"].toString();
  // value() keeps a missing sequence missing in the event the runtime receives.
  const auto seq = event.value("job_seq").toDouble();
  if (seq > 0 && seq <= run["last_seq"].toDouble()) {
    return;
  }
  const bool lifecycle = type == "job_update" || type == "job_resumed";
  const auto reported = event.value("status").toString();
  const bool settles = QStringList{"completed", "failed", "cancelled", "finished", "error"}.contains(reported);
  // A late lifecycle frame never reopens a finished run.
  if (lifecycle && run.value("terminal").toBool() && !settles) {
    return;
  }
  if (type == "job_resumed" && reported == "unknown") {
    // The server lost the run. Like settleLostRun in web/src/stores/workflowUpdates.ts,
    // settle it as failed so it neither runs forever nor blocks the next run.
    const auto message = tr("Lost track of this run after reconnecting. Check the job queue for its result.");
    run.insert("uncertain", false);
    run.insert("terminal", true);
    run.insert("status", "failed");
    run.insert("error", message);
    if (m_accountJobs) {
        m_accountJobs->refresh();
    }
    emit errorOccurred(message);
    emit stateChanged();
    emit runEvent(id, event);
    return;
  }
  if (seq > 0 || lifecycle) {
    run.insert("uncertain", false);
  }
  // A "finished" reply with frames to replay leaves the outcome to the replayed job_update.
  const bool awaitingReplay = type == "job_resumed" && reported == "finished" && event.value("replay_count").toDouble() > 0;
  if (lifecycle && settles && !awaitingReplay) {
    run.insert("terminal", true);
  }
  if (seq > 0) {
    run.insert("last_seq", seq);
  }
  if (awaitingReplay) {
    emit stateChanged();
  } else if (lifecycle) {
    auto status = event["status"].toString();
    if (status == "finished") status = "completed";
    if (status == "error") status = "failed";
    if (event["started_at"].isString()) {
        run.insert("started_at", event["started_at"]);
    }
    run.insert("status", status);
    run.insert("queue_position", event["queue_position"]);
    if (m_accountJobs) {
        m_accountJobs->refresh();
    }
    run.insert("error", event["error"]);
    if (status == "failed") run.insert("terminal", true);
    emit stateChanged();
  }
  m_generations.ingest(id, event, QDateTime::currentMSecsSinceEpoch());
  if (type == "generation_complete") { m_history.liveChanged(); }
  emit runEvent(id, event);
}
} // namespace nodetool::node_editor
