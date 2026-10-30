#include "ChatSession.h"
#include <QClipboard>
#include <QDateTime>
#include <QDesktopServices>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QMimeDatabase>
#include <QUuid>
namespace nt::chat {
ChatSession::ChatSession(QObject *parent)
    : QObject(parent), m_threads(this), m_empty(this), m_client(this) {
  connect(&m_client, &ChatClient::eventReceived, this,
          &ChatSession::applyEvent);
  connect(&m_client, &ChatClient::errorOccurred, this, &ChatSession::fail);
  connect(
      &m_client, &ChatClient::statusChanged, this,
      [this](const QString &status) {
        m_connection = status;
        if (status == "connected") {
          m_error.clear();
          m_client.send({{"type", "client_tools_manifest"},
                         {"tools", QJsonArray::fromVariantList(m_hostTools)}});
          refresh();
          for (auto &[id, s] : m_states) {
            if (s.reloadHistory) {
              s.reloadHistory = false;
              loadHistory(id, false);
            }
            if (s.status == "interrupted") {
              m_client.send({{"command", "resume_chat"},
                             {"data", QJsonObject{{"thread_id", id},
                                                  {"last_seq", s.sequence}}}});
            }
          }
          m_client.send(
              {{"command", "list_chat_turns"}, {"data", QJsonObject{}}});
          for (const auto &result : m_hostResults) {
            m_client.send(result);
          }
        } else if (status == "disconnected") {
          for (auto &[id, s] : m_states) {
            if (s.reconciling) {
              s.reloadHistory = true;
              s.reconciling = false;
              s.bufferedEvents = {};
            }
            if (s.status == "loading" || s.status == "streaming" ||
                s.status == "stopping") {
              s.status = "interrupted";
              m_threads.setStatus(id, s.status);
            }
          }
        }
        emit stateChanged();
      });
}
ChatSession::~ChatSession() {
  m_client.disconnect(this);
  m_client.disconnectFromServer();
}
ChatSession::State &ChatSession::state(const QString &id) {
  auto &s = m_states[id];
  if (!s.messages) {
    s.messages = std::make_unique<MessageModel>();
  }
  return s;
}
const ChatSession::State *ChatSession::current() const {
  const auto it = m_states.find(m_selected);
  return it == m_states.end() ? nullptr : &it->second;
}
QAbstractItemModel *ChatSession::messages() {
  return m_selected.isEmpty() ? &m_empty : state(m_selected).messages.get();
}
QString ChatSession::draft() const {
  const auto *s = current();
  return s ? s->draft : QString{};
}
void ChatSession::setDraft(const QString &text) {
  if (m_selected.isEmpty()) {
    return;
  }
  state(m_selected).draft = text.left(64 * 1024);
  emit stateChanged();
}
QString ChatSession::turnStatus() const {
  const auto *s = current();
  return s ? s->status : "idle";
}
bool ChatSession::historyLoading() const {
  const auto *s = current();
  return s && s->reconciling;
}
QVariantList ChatSession::attachments() const {
  const auto *s = current();
  return s ? s->attachments : QVariantList{};
}
void ChatSession::fail(const QString &error) {
  m_error = error;
  emit stateChanged();
}
QString ChatSession::error() const {
  const auto *s = current();
  return !m_error.isEmpty() ? m_error : s ? s->error : QString{};
}
void ChatSession::connectToServer(const QUrl &url, const QString &token) {
  if (url != m_serverUrl || token != m_serverToken) {
    disconnectFromServer();
  }
  m_serverUrl = url;
  m_serverToken = token;
  m_client.connectToServer(url, token);
}
void ChatSession::suspendConnection() { m_client.disconnectFromServer(); }
void ChatSession::resumeConnection() {
  if (m_serverUrl.isValid()) {
    m_client.connectToServer(m_serverUrl, m_serverToken);
  }
}
void ChatSession::disconnectFromServer() {
  m_client.disconnectFromServer();
  m_serverUrl = QUrl{};
  m_serverToken.clear();
  m_previewBytes = 0;
  m_states.clear();
  m_threads.clear();
  m_selected.clear();
  m_actions.clear();
  m_hostCalls.clear();
  m_hostResults.clear();
  m_historyOrder.clear();
  m_error.clear();
  emit stateChanged();
}
void ChatSession::upsertThread(const QJsonObject &thread) {
  if (m_states.size() >= 500 &&
      m_states.find(thread["id"].toString()) == m_states.end()) {
    return;
  }
  auto projection = thread;
  const auto existing = m_states.find(thread["id"].toString());
  if (existing != m_states.end()) {
    projection["status"] = existing->second.status;
  }
  m_threads.upsert(projection);
  if (!thread["id"].toString().isEmpty()) {
    state(thread["id"].toString());
  }
}
void ChatSession::selectThread(const QString &id) {
  if (m_threads.get(id).isEmpty()) {
    return;
  }
  m_selected = id;
  m_historyOrder.removeAll(id);
  m_historyOrder.append(id);
  while (m_historyOrder.size() > 8) {
    const auto oldest = m_historyOrder.takeFirst();
    unloadThread(oldest);
  }
  auto &s = state(id);
  if (s.messages->rowCount() == 0 && m_client.ready()) {
    loadHistory(id, false);
  }
  emit stateChanged();
}
void ChatSession::unloadThread(const QString &id) {
  const auto found = m_states.find(id);
  if (found == m_states.end() || id == m_selected) {
    return;
  }
  auto &s = found->second;
  if (s.status == "loading" || s.status == "streaming" ||
      s.status == "stopping" || s.reconciling) {
    return;
  }
  s.messages->clear();
  // Resolved previews are owned by the message rows and released here.
  s.cursor.clear();
}
void ChatSession::createThread() {
  m_client.call("threads.create", {{"project_id", "default"}}, true,
                [this](QJsonValue result, QString error) {
                  if (!error.isEmpty()) {
                    fail(error);
                    return;
                  }
                  upsertThread(result.toObject());
                  selectThread(result.toObject()["id"].toString());
                });
}
void ChatSession::refresh() {
  if (!m_client.ready()) {
    return;
  }
  m_client.call(
      "threads.list", {{"limit", 100}, {"reverse", true}}, false,
      [this](QJsonValue result, QString error) {
        if (!error.isEmpty()) {
          fail(error);
          return;
        }
        for (const auto &thread : result.toObject()["threads"].toArray()) {
          upsertThread(thread.toObject());
        }
        if (m_selected.isEmpty() && m_threads.rowCount() > 0) {
          selectThread(
              m_threads.data(m_threads.index(0), ThreadModel::ThreadIdRole)
                  .toString());
        }
        emit stateChanged();
      });
}
void ChatSession::loadHistory(const QString &id, bool prepend) {
  auto &s = state(id);
  if (s.reconciling) {
    return;
  }
  QJsonObject input{{"thread_id", id}, {"limit", 100}, {"reverse", true}};
  if (prepend) {
    if (s.cursor.isEmpty()) {
      return;
    }
    input["cursor"] = s.cursor;
  }
  if (!prepend) {
    s.reconciling = true;
    emit stateChanged();
  }
  m_client.call("messages.list", input, false,
                [this, id, prepend](QJsonValue result, QString error) {
                  if (!error.isEmpty()) {
                    state(id).reconciling = false;
                    state(id).bufferedEvents = {};
                    state(id).error = error;
                    emit stateChanged();
                    return;
                  }
                  auto rows = result.toObject()["messages"].toArray();
                  QJsonArray ordered;
                  for (auto it = rows.end(); it != rows.begin();) {
                    --it;
                    ordered.append(*it);
                  }
                  state(id).cursor = result.toObject()["next"].toString();
                  importHistory(id, ordered, prepend);
                  if (!prepend) {
                    auto events = state(id).bufferedEvents;
                    state(id).bufferedEvents = {};
                    state(id).reconciling = false;
                    for (const auto &event : events) {
                      applyEvent(event.toObject());
                    }
                  }
                  emit stateChanged();
                });
}
void ChatSession::loadMore() {
  if (!m_selected.isEmpty()) {
    loadHistory(m_selected, true);
  }
}
bool ChatSession::hasMoreHistory() const {
  const auto *s = current();
  return s && !s->cursor.isEmpty() && !s->reconciling &&
         s->messages->rowCount() < 10000;
}
void ChatSession::importHistory(const QString &id, const QJsonArray &rows,
                                bool prepend) {
  state(id).messages->importHistory(rows, prepend);
  for (const auto &row : rows) {
    resolveMedia(id, row.toObject());
  }
  emit stateChanged();
}
void ChatSession::resolveMedia(const QString &id, const QJsonObject &message,
                               const QString &projectionKey) {
  for (const auto &value : message["content"].toArray()) {
    const auto part = value.toObject();
    if (part["type"] != "image_url") {
      continue;
    }
    const auto image = part["image"].toObject();
    const auto uri = image["uri"].toString();
    const auto key =
        projectionKey.isEmpty() ? message["id"].toString() : projectionKey;
    auto receive = [this, id, key, part](QJsonValue data, QString error) {
      if (!error.isEmpty() ||
          m_previewBytes + data.toString().size() > 32 * 1024 * 1024) {
        return;
      }
      auto preview = part;
      preview["mediaUrl"] = data;
      preview["type"] = "image";
      if (state(id).messages->addResolvedPart(key, preview)) {
        m_previewBytes += data.toString().size();
      }
    };
    if (uri.startsWith("asset://") || !image["asset_id"].toString().isEmpty()) {
      const auto asset = image["asset_id"].toString().isEmpty()
                             ? uri.mid(8).section('.', 0, 0)
                             : image["asset_id"].toString();
      m_client.call("assets.get", {{"id", asset}}, false,
                    [this, receive](QJsonValue value, QString error) {
                      if (!error.isEmpty()) {
                        return;
                      }
                      const auto url = value.toObject()["get_url"].toString();
                      if (!url.isEmpty()) {
                        m_client.fetchMedia(QUrl(url), receive);
                      }
                    });
    } else if (!uri.isEmpty()) {
      m_client.fetchMedia(QUrl(uri), receive);
    }
  }
}
void ChatSession::send() {
  if (m_selected.isEmpty()) {
    fail("Create or select a conversation first");
    return;
  }
  auto &s = state(m_selected);
  if (s.reconciling) {
    fail("Wait for conversation history to load before sending");
    return;
  }
  if ((s.draft.trimmed().isEmpty() && s.attachments.isEmpty()) ||
      s.status == "loading" || s.status == "streaming" ||
      s.status == "stopping") {
    return;
  }
  if (!m_client.ready()) {
    fail("Connect before sending. Your draft has been kept.");
    return;
  }
  const auto id = QUuid::createUuid().toString(QUuid::Id128);
  QJsonObject message{
      {"id", id},
      {"type", "message"},
      {"role", "user"},
      {"thread_id", m_selected},
      {"content", s.draft},
      {"created_at", QDateTime::currentDateTimeUtc().toString(Qt::ISODate)},
      {"project_id",
       m_threads.get(m_selected)["project_id"].toString("default")},
      {"permission_mode", "default"}};
  QJsonArray content;
  content.append(QJsonObject{{"type", "text"}, {"text", s.draft}});
  for (const auto &attachment : s.attachments) {
    const auto item = attachment.toMap();
    if (item["status"] != "ready") {
      fail("Wait for attachments to finish uploading or remove failed "
           "attachments");
      return;
    }
    const auto mime = item["mimeType"].toString();
    const auto kind = mime.startsWith("image/")   ? QString("image")
                      : mime.startsWith("audio/") ? QString("audio")
                      : mime.startsWith("video/") ? QString("video")
                                                  : QString("document");
    content.append(QJsonObject{
        {"type", kind == "image" ? "image_url" : kind},
        {kind, QJsonObject{{"type", kind},
                           {"uri", "asset://" + item["assetId"].toString()}}}});
  }
  if (!s.attachments.isEmpty()) {
    message["content"] = content;
  }
  if (!m_provider.isEmpty()) {
    message["provider"] = m_provider;
  }
  if (!m_model.isEmpty()) {
    message["model"] = m_model;
  }
  if (!m_hostContext.isEmpty()) {
    message["system_prompt"] =
        QString::fromUtf8(QJsonDocument::fromVariant(m_hostContext)
                              .toJson(QJsonDocument::Compact));
  }
  if (!m_client.send({{"command", "chat_message"}, {"data", message}})) {
    return;
  }
  s.messages->upsert(message);
  s.draft.clear();
  s.attachments.clear();
  s.status = "loading";
  m_error.clear();
  s.error.clear();
  m_threads.setStatus(m_selected, s.status);
  emit stateChanged();
}
void ChatSession::stop() {
  if (m_selected.isEmpty()) {
    return;
  }
  if (m_client.send({{"command", "stop"},
                     {"data", QJsonObject{{"thread_id", m_selected}}}})) {
    state(m_selected).status = "stopping";
    m_threads.setStatus(m_selected, "stopping");
    emit stateChanged();
  }
}
void ChatSession::setHostTools(const QVariantList &tools) {
  m_hostTools = tools;
  if (m_client.ready()) {
    m_client.send({{"type", "client_tools_manifest"},
                   {"tools", QJsonArray::fromVariantList(tools)}});
  }
}
void ChatSession::completeHostTool(const QString &id, const QVariantMap &result,
                                   const QString &error) {
  const auto call = m_hostCalls.take(id);
  if (call.isEmpty()) {
    return;
  }
  QJsonObject response{{"type", "tool_result"},
                       {"tool_call_id", id},
                       {"thread_id", call["thread_id"]},
                       {"ok", error.isEmpty()},
                       {"error", error},
                       {"result", error.isEmpty()
                                      ? QJsonObject::fromVariantMap(result)
                                      : QJsonObject{{"error", error}}}};

  m_hostResults[id] = response;
  m_client.send(response);
}
void ChatSession::respondToAction(const QString &id, bool approved,
                                  const QString &text) {
  const auto action = m_actions.value(id);
  if (action.isEmpty()) {
    return;
  }
  const auto kind = action["type"].toString();
  QJsonObject response{{"approval_id", id}};
  if (kind == "tool_approval_request") {
    response["type"] = "tool_approval_response";
    response["decision"] = approved ? "allow" : "deny";
  } else if (kind == "plan_approval_request") {
    response["type"] = "plan_approval_response";
    response["decision"] = approved ? "approve" : "reject";
    if (!text.isEmpty()) {
      response["feedback"] = text;
    }
  } else if (kind == "secret_request") {
    response["type"] = "secret_request_response";
    response["status"] = "declined";
  } else {
    return;
  }
  if (!m_client.send(response)) {
    return;
  }
  m_actions.remove(id);
  auto part = action;
  part["actionId"] = id;
  part["pending"] = false;
  part["status"] = approved ? "approved" : "declined";
  state(action["thread_id"].toString()).messages->addPart(part);
  emit stateChanged();
}
void ChatSession::addAttachment(const QUrl &local) {
  if (m_selected.isEmpty() || !m_client.ready()) {
    fail("Connect and select a conversation before attaching a file");
    return;
  }
  const auto thread = m_selected;
  const auto id = QUuid::createUuid().toString(QUuid::Id128);
  const auto mime = QMimeDatabase().mimeTypeForFile(local.toLocalFile()).name();
  state(thread).attachments.append(
      QVariantMap{{"id", id},
                  {"name", QFileInfo(local.toLocalFile()).fileName()},
                  {"status", "uploading"},
                  {"progress", 0},
                  {"mimeType", mime}});
  emit stateChanged();
  m_client.upload(
      id, local,
      [this, thread, id](QJsonValue value, QString error) {
        auto &items = state(thread).attachments;
        bool found = false;
        for (int i = 0; i < items.size(); ++i) {
          auto item = items[i].toMap();
          if (item["id"] != id) {
            continue;
          }
          item["status"] = error.isEmpty() ? "ready" : "failed";
          found = true;
          if (error.isEmpty()) {
            item["progress"] = 100;
          }
          item["error"] = error;
          item["assetId"] = value.toObject()["id"].toString();
          items[i] = item;
        }
        if (!found) {
          return;
        }
        if (!error.isEmpty()) {
          fail(error);
        }
        emit stateChanged();
      },
      [this, thread, id](qint64 done, qint64 total) {
        auto &items = state(thread).attachments;
        for (int i = 0; i < items.size(); ++i) {
          auto item = items[i].toMap();
          if (item["id"] == id && item["status"] == "uploading") {
            item["progress"] = total > 0 ? 100.0 * done / total : 0;
            items[i] = item;
          }
        }
        emit stateChanged();
      });
}
void ChatSession::removeAttachment(const QString &id) {
  if (m_selected.isEmpty()) {
    return;
  }
  auto &items = state(m_selected).attachments;
  for (int i = 0; i < items.size(); ++i) {
    if (items[i].toMap()["id"].toString() == id) {
      items.removeAt(i);
      break;
    }
  }
  m_client.cancelUpload(id);
  emit stateChanged();
}
void ChatSession::openExternal(const QUrl &url) {
  if (url.scheme() == "https" || url.scheme() == "http" ||
      url.scheme() == "mailto") {
    QDesktopServices::openUrl(url);
  } else {
    fail("This link scheme is not supported");
  }
}
void ChatSession::copyText(const QString &text) {
  if (auto *clipboard = QGuiApplication::clipboard()) {
    clipboard->setText(text);
  }
}
void ChatSession::applyEvent(const QJsonObject &event) {
  const auto id = event["thread_id"].toString();
  const auto type = event["type"].toString();
  if (id.isEmpty()) {
    if (type == "error") {
      fail(event["message"].toString());
    }
    return;
  }
  if (m_states.size() >= 500 && m_states.find(id) == m_states.end()) {
    fail("Conversation limit reached. Reconnect to release inactive "
         "conversations.");
    return;
  }
  auto &s = state(id);
  if (s.reconciling && type != "chat_resumed") {
    if (s.bufferedEvents.size() < 4096) {
      s.bufferedEvents.append(event);
    } else {
      fail("Chat replay exceeded the reconciliation buffer. Reload this "
           "conversation.");
    }
    return;
  }
  if (m_threads.get(id).isEmpty()) {
    m_threads.upsert({{"id", id}, {"title", "Conversation"}});
  }
  if (event["chat_seq"].isDouble()) {
    const auto seq = event["chat_seq"].toInteger();
    if (seq <= s.sequence) {
      return;
    }
    if (!s.uncertainReplay && s.sequence > 0 && seq > s.sequence + 1) {
      s.status = "interrupted";
      m_threads.setStatus(id, s.status);
      fail("Chat replay has a sequence gap. Reloading saved history.");
      if (m_client.ready()) {
        loadHistory(id, false);
      }
      return;
    }
    s.sequence = seq;
  }
  if (s.status == "stopping" && type != "generation_stopped" &&
      type != "error" && type != "job_update") {
    return;
  }
  if (type == "chunk") {
    if (s.uncertainReplay) {
      s.status = "interrupted";
      m_threads.setStatus(id, s.status);
      emit stateChanged();
      return;
    }
    if (event["content"].isString() && !event["thinking"].toBool() &&
        event["sub_agent_call_id"].toString().isEmpty()) {
      s.messages->appendChunk(event["content"].toString(),
                              event["done"].toBool());
    }
    s.status = event["done"].toBool() ? "idle" : "streaming";
  } else if (type == "message") {
    if (event["role"] == "assistant") {
      s.uncertainReplay = false;
    }
    const auto projectionKey = s.messages->upsert(event);
    resolveMedia(id, event, projectionKey);
    if (event["role"] == "assistant" &&
        event["tool_calls"].toArray().isEmpty()) {
      s.status = "idle";
    }
  } else if (type == "error") {
    s.status = "error";
    s.error = event["message"].toString("Chat failed");
    s.messages->addPart({{"type", "error"}, {"text", s.error}});
  } else if (type == "generation_stopped") {
    s.status = "idle";
  } else if (type == "chat_resumed") {
    if (event["status"] == "unknown" || event["replay_incomplete"].toBool()) {
      s.status = "interrupted";
      s.uncertainReplay = true;
      fail("The interrupted response is being reconciled from saved history. "
           "Text replay is withheld until a complete response arrives.");
      loadHistory(id, false);
    } else {
      s.status = event["status"] == "running" ? "streaming" : "idle";
    }
  } else if (type == "chat_turn_active") {
    m_client.send(
        {{"command", "resume_chat"},
         {"data", QJsonObject{{"thread_id", id}, {"last_seq", s.sequence}}}});
  } else if (type == "tool_call") {
    const auto callId = event["tool_call_id"].toString();
    if (m_hostResults.contains(callId)) {
      m_client.send(m_hostResults.value(callId));
      return;
    }
    if (m_hostCalls.contains(callId)) {
      return;
    }
    if (m_hostResults.size() >= 1024 || m_hostCalls.size() >= 64) {
      m_client.send(
          {{"type", "tool_result"},
           {"tool_call_id", callId},
           {"thread_id", id},
           {"ok", false},
           {"result",
            QJsonObject{{"error", "Native host action limit reached. Reconnect "
                                  "before another edit."}}}});
      return;
    }
    bool supported = false;
    for (const auto &tool : m_hostTools) {
      if (tool.toMap()["name"].toString() == event["name"].toString()) {
        supported = true;
      }
    }
    m_hostCalls[callId] = event;
    if (supported) {
      emit hostToolRequested(callId, event["name"].toString(),
                             event["args"].toObject().toVariantMap());
    } else {
      completeHostTool(callId, {},
                       "Unsupported native host capability: " +
                           event["name"].toString());
    }
  } else {
    auto part = event;
    part["text"] =
        QString::fromUtf8(QJsonDocument(event).toJson(QJsonDocument::Compact));
    if (type == "tool_approval_request" || type == "plan_approval_request" ||
        type == "secret_request") {
      const auto actionId = event["approval_id"].toString();
      if (actionId.isEmpty()) {
        return;
      }
      m_actions[actionId] = event;
      part["actionId"] = actionId;
      part["pending"] = true;
      part["text"] = event["description"].toString(
          event["message"].toString(part["text"].toString()));
    }
    s.messages->addPart(part);
  }
  m_threads.setStatus(id, s.status);
  int idleHistories = 0;
  for (const auto &[thread, entry] : m_states) {
    if (entry.messages->rowCount() > 0 && entry.status != "loading" &&
        entry.status != "streaming" && entry.status != "stopping" &&
        !entry.reconciling) {
      ++idleHistories;
    }
  }
  if (idleHistories > 8) {
    for (const auto &[thread, entry] : m_states) {
      if (thread != m_selected && entry.messages->rowCount() > 0 &&
          entry.status != "loading" && entry.status != "streaming" &&
          entry.status != "stopping" && !entry.reconciling) {
        unloadThread(thread);
        if (--idleHistories <= 8) {
          break;
        }
      }
    }
  }
  emit stateChanged();
}
QJsonObject ChatSession::dumpState() const {
  QJsonObject states;
  for (const auto &[id, s] : m_states) {
    states[id] = QJsonObject{{"messages", s.messages->snapshot()},
                             {"draft", s.draft},
                             {"status", s.status},
                             {"sequence", s.sequence}};
  }
  return {{"selectedThreadId", m_selected},
          {"connectionStatus", m_connection},
          {"threads", states}};
}
} // namespace nt::chat
