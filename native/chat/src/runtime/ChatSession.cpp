#include "model/Markdown.h"
#include <QClipboard>
#include <QGuiApplication>
#include "ChatSession.h"
#include "ComposerRules.h"
#include <QClipboard>
#include <QDateTime>
#include <QDesktopServices>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QMimeDatabase>
#include <QTimer>
#include <QUuid>
#include <algorithm>
namespace nt::chat {
QVariantList ChatSession::markdownPages(const QString &text) const { return nt::chat::markdownPages(text); }
void ChatSession::styleMarkdownLinks(QQuickTextDocument *document, const QColor &colour) {
  if (document && document->textDocument()) { nt::chat::styleMarkdownLinks(*document->textDocument(), colour); }
}
void ChatSession::copyText(const QString &text) { QGuiApplication::clipboard()->setText(text); }

ChatSession::ChatSession(QObject *parent)
    : QObject(parent), m_threads(this), m_empty(this), m_client(this), m_catalog(this), m_mediaCatalog(this) {
  m_catalog.setMode("chat");
    // native-rules #12: async callback captures raw this, not a QPointer
    m_mediaCatalog.setQuery([this](const QString &procedure, QJsonObject input,
                                   nt::modelpicker::Catalog::Completion done) {
        m_client.call(procedure, input, false, [done = std::move(done)](QJsonValue value, QString error) mutable {
            done(value, error);
        });
    });
    // ModeChips.tsx onPick handlers snap settings the picked model cannot take.
    connect(&m_mediaCatalog, &nt::modelpicker::Catalog::selectionCommitted, this, [this] {
        if (composer::isMediaMode(m_mediaMode)) {
            m_mediaSettings[m_mediaMode] =
                composer::clampSettings(m_mediaMode, mediaSettings(), m_mediaCatalog.constraints());
        }
        emit stateChanged();
    });
    connect(&m_mediaCatalog, &nt::modelpicker::Catalog::changed, this, &ChatSession::stateChanged);
    // native-rules #2: Qt parent is not documented
    m_assetTimer = new QTimer(this);
    m_assetTimer->setSingleShot(true);
    m_assetTimer->setInterval(150);
    connect(m_assetTimer, &QTimer::timeout, this, [this] {
        requestAssets(false);
    });
  // native-rules #12: async callback captures raw this, not a QPointer
  m_catalog.setQuery([this](const QString &procedure, QJsonObject input,
                            nt::modelpicker::Catalog::Completion done) {
    m_client.call(procedure, input, false,
                  [done = std::move(done)](QJsonValue value, QString error) mutable {
                    done(value, error);
                  });
  });
  connect(&m_catalog, &nt::modelpicker::Catalog::selectionCommitted, this,
          [this](const QString &id, const QString &provider) {
            m_model = id;
            m_provider = provider;
            emit stateChanged();
          });
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
          const auto pendingRequests = m_hostRequests.keys();
          m_hostRequests.clear();
          for (const auto &requestId : pendingRequests) {
            emit hostResponseReceived({{"type", "rpc_response"}, {"request_id", requestId},
                                       {"error", QJsonObject{{"message", "Chat connection closed."}}}});
          }
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
  m_catalog.setIdentity(url.toString(QUrl::RemoveUserInfo) + QChar(0x1f) + token);
    m_mediaCatalog.setIdentity(url.toString(QUrl::RemoveUserInfo) + QChar(0x1f) + token);
  m_provider = m_catalog.selectedProvider();
  m_model = m_catalog.selectedModelId();
  emit stateChanged();
}
void ChatSession::useServerDefaultModel() { m_catalog.clearSelection(); }
void ChatSession::openProviderSettings() {
  if (m_serverUrl.scheme() != "http" && m_serverUrl.scheme() != "https") {
    fail("Connect to a server before opening provider settings.");
    return;
  }
  auto url = m_serverUrl;
  url.setPath("/settings");
  url.setQuery("tab=1");
  url.setFragment({});
  if (!QDesktopServices::openUrl(url)) fail("Could not open provider settings.");
}
void ChatSession::suspendConnection() { m_client.disconnectFromServer(); }
void ChatSession::resumeConnection() {
  if (m_serverUrl.isValid()) {
    m_client.connectToServer(m_serverUrl, m_serverToken);
  }
}
void ChatSession::disconnectFromServer() {
  m_hostRequests.clear();
    auto uiContext = m_hostContext.value("ui_context").toMap();
    uiContext.remove("run");
    m_hostContext["ui_context"] = uiContext;
  m_catalog.setIdentity({});
    m_mediaCatalog.setIdentity({});
    ++m_assetSearch;
    m_assetTimer->stop();
    m_assetResults.clear();
    m_recentAssets.clear();
    m_assetQuery.clear();
    m_assetCursor.clear();
    m_assetSearchOpen = false;
    emit assetsChanged();
  m_provider.clear();
  m_model.clear();
  m_client.disconnectFromServer();
  m_serverUrl = QUrl{};
  m_serverToken.clear();
  m_previewBytes = 0;
  m_states.clear();
  m_threads.clear();
  m_selected.clear();
  m_actions.clear();
  m_answeredActions.clear();
  m_hostCalls.clear();
  m_hostResults.clear();
  m_hostRequests.clear();
  m_historyOrder.clear();
  m_threadWorkflows.clear();
  m_workflowThreads.clear();
    m_creatingWorkflows.clear();
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
  m_workflowThreads[m_workflow] = id;
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
QVariantList ChatSession::workflowThreads() const {
    QVariantList result;
    auto rows = m_threads.rows();
    std::stable_sort(rows.begin(), rows.end(), [](const auto &a, const auto &b) {
        return a["updated_at"].toString() > b["updated_at"].toString();
    });
    for (const auto &row : rows) {
        const auto id = row["id"].toString();
        const auto binding = row["workflow_id"].isNull() || row["workflow_id"].isUndefined()
            ? m_threadWorkflows.value(id) : row["workflow_id"].toString();
        if (!m_workflow.isEmpty() && binding != m_workflow) {
            continue;
        }
        auto entry = row.toVariantMap();
        QString preview = row["title"].toString();
        const auto found = m_states.find(id);
        if (preview.isEmpty() && found != m_states.end()) {
            for (const auto &value : found->second.messages->snapshot()) {
                const auto message = value.toObject();
                if (message["role"] != "user") {
                    continue;
                }
                const auto content = message["content"];
                if (content.isString()) {
                    preview = content.toString();
                } else if (content.isArray() && !content.toArray().isEmpty() && content.toArray().first().toObject()["type"] == "text") {
                    preview = content.toArray().first().toObject()["text"].toString();
                } else {
                    preview = "[Media message]";
                }
                if (preview.size() > 50) {
                    preview = preview.left(50) + "...";
                }
                break;
            }
        }
        entry["preview"] = preview.isEmpty() ? QString("New conversation") : preview;
        result.append(entry);
    }
    return result;
}
QString ChatSession::threadTitle() const {
    return m_threads.get(m_selected)["title"].toString("Chat");
}
void ChatSession::setWorkflow(const QString &id) {
    if (m_workflow == id) {
        return;
    }
    m_workflow = id;
    m_selected.clear();
    const auto previous = m_workflowThreads.value(id);
    if (!previous.isEmpty()) {
        selectThread(previous);
    } else {
        const auto rows = workflowThreads();
        if (!rows.isEmpty()) {
            selectThread(rows.first().toMap()["id"].toString());
        } else if (m_client.ready() && !id.isEmpty() && !m_creatingWorkflows.contains(id)) {
            createThread();
        }
    }
    emit stateChanged();
}
void ChatSession::deleteThread(const QString &id) {
    m_client.call("threads.delete", {{"id", id}}, true,
        // native-rules #12: async callback captures raw this, not a QPointer
        [this, id](QJsonValue, QString error) {
            if (!error.isEmpty()) {
                fail("Could not delete the conversation. Please try again.");
                return;
            }
            m_threads.remove(id);
            m_states.erase(id);
            m_threadWorkflows.remove(id);
            if (m_selected == id) {
                m_selected.clear();
            }
            emit stateChanged();
        });
}
bool ChatSession::hasActiveTurns() const {
    for (const auto &[id, state] : m_states) {
        if (state.status == "loading" || state.status == "streaming" || state.status == "stopping" || state.status == "interrupted") {
            return true;
        }
    }
    return false;
}
void ChatSession::retry() {
    if (m_selected.isEmpty() || turnStatus() != "error") {
        return;
    }
    state(m_selected).draft = state(m_selected).lastPrompt;
    state(m_selected).attachments = state(m_selected).lastAttachments;
    send();
}
void ChatSession::createThread(const QString &draft) {
    const auto workflow = m_workflow;
    m_creatingWorkflows.insert(workflow);
    QJsonObject input{{"project_id", "default"}};
    if (!workflow.isEmpty()) {
        input["workflow_id"] = workflow;
    }
    m_client.call("threads.create", input, true,
        // native-rules #12: async callback captures raw this, not a QPointer
        [this, workflow, draft](QJsonValue result, QString error) {
            m_creatingWorkflows.remove(workflow);
            if (!error.isEmpty()) {
                fail(error);
                return;
            }
            const auto id = result.toObject()["id"].toString();
            m_threadWorkflows[id] = workflow;
            upsertThread(result.toObject());
            state(id).draft = draft;
            if (workflow == m_workflow) {
                selectThread(id);
            }
        });
}
void ChatSession::refresh() {
  if (!m_client.ready()) {
    return;
  }
  m_client.call(
      "threads.list", {{"limit", 100}, {"reverse", true}}, false,
      // native-rules #12: async callback captures raw this, not a QPointer
      [this](QJsonValue result, QString error) {
        if (!error.isEmpty()) {
          fail(error);
          return;
        }
        for (const auto &thread : result.toObject()["threads"].toArray()) {
          upsertThread(thread.toObject());
        }
        const auto rows = workflowThreads();
        if (m_selected.isEmpty() && !rows.isEmpty()) {
            selectThread(rows.first().toMap()["id"].toString());
        } else if (m_selected.isEmpty() && !m_workflow.isEmpty() && !m_creatingWorkflows.contains(m_workflow)) {
            createThread();
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
                // native-rules #12: async callback captures raw this, not a QPointer
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
  if (!prepend) {
    for (auto it = m_actions.cbegin(); it != m_actions.cend(); ++it) {
      if (it.value()["thread_id"] != id) { continue; }
      auto part = it.value();
      part["actionId"] = it.key();
      part["pending"] = true;
      state(id).messages->addPart(part);
    }
  }
  for (const auto &row : rows) {
    resolveMedia(id, row.toObject());
  }
  emit stateChanged();
}
void ChatSession::resolveMedia(const QString &id, const QJsonObject &message,
                               const QString &projectionKey) {
  for (const auto &value : message["content"].toArray()) {
    const auto part = value.toObject();
    const auto kind = part["type"].toString();
    const bool thumbnail = kind == "audio" || kind == "video";
    if (kind != "image_url" && !thumbnail) { continue; }
    auto image = part["image"].toObject();
    if (thumbnail) {
      const auto ref = part[kind].toObject();
      const auto source = ref["thumbnail"];
      image = source.isObject() ? source.toObject() : QJsonObject{{"uri", source.toString(ref["thumbnail_url"].toString())}};
      if (image["uri"].toString().isEmpty() && image["asset_id"].toString().isEmpty()) { continue; }
    }
    const auto uri = image.value("uri").toString(image.value("data").toString());
    const auto key =
        projectionKey.isEmpty() ? message["id"].toString() : projectionKey;
    // native-rules #12: async callback captures raw this, not a QPointer
    auto receive = [this, id, key, part](QJsonValue data, QString error) {
      if (m_previewBytes + data.toString().size() * 2 > 32 * 1024 * 1024) {
        error = "Image preview memory limit reached";
        data = {};
      }
      auto preview = part;
      preview["mediaUrl"] = data;
      preview["mediaError"] = error;
      preview["originalMedia"] = part;
      preview["resolvedMedia"] = true;
      if (part["type"] == "image_url") { preview["type"] = "image"; }
      if (state(id).messages->addResolvedPart(key, preview)) {
        m_previewBytes += data.toString().size() * 2;
      }
    };
    if (uri.startsWith("asset://") || !image["asset_id"].toString().isEmpty()) {
      const auto asset = image["asset_id"].toString().isEmpty()
                             ? uri.mid(8)
                             : image["asset_id"].toString();
      m_client.call("assets.get", {{"id", asset}}, false,
                    // native-rules #12: async callback captures raw this, not a QPointer
                    [this, receive](QJsonValue value, QString error) {
                      if (!error.isEmpty()) {
                        receive({}, "Image preview unavailable");
                        return;
                      }
                      const auto url = value.toObject()["get_url"].toString();
                      if (!url.isEmpty()) {
                        m_client.fetchMedia(QUrl(url), receive);
                      } else { receive({}, "Image source unavailable"); }
                    });
    } else if (!uri.isEmpty()) {
      m_client.fetchMedia(QUrl(uri), receive);
    } else { receive({}, "Image source unavailable"); }
  }
}
void ChatSession::send() {
  const bool media = composer::isMediaMode(m_mediaMode);
  if (!media && !m_model.isEmpty() && m_catalog.selectedModelId() == m_model &&
      m_catalog.selectedProvider() == m_provider && m_catalog.loaded() &&
      !m_catalog.selectionAvailable()) {
    fail("The selected model is unavailable. Choose another model or use the server default.");
    return;
  }
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
    // MediaChatComposer.tsx refuses a media send with no model and opens the picker.
    if (media && m_mediaCatalog.selectedModelId().isEmpty()) {
        fail(composer::pickModelMessage(m_mediaMode));
        emit modelPickerRequested();
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
      {"name", ""},
      {"ui_context", QJsonValue::Null},
      {"media_generation", QJsonValue::Null},
      {"project_id",
       m_threads.get(m_selected)["project_id"].toString("default")},
      {"permission_mode", "default"}};
  // MediaChatComposer.tsx submitPrompt sends a text part only for a non-blank prompt.
  QJsonArray content;
    if (!s.draft.trimmed().isEmpty()) {
        content.append(QJsonObject{{"type", "text"}, {"text", s.draft}});
    }
  for (const auto &attachment : s.attachments) {
    const auto item = attachment.toMap();
    if (item["status"] != "ready") {
      fail("Wait for attachments to finish uploading or remove failed "
           "attachments");
      return;
    }
        // The server's asset record decides the part, as useDragAndDrop.ts assetToDroppedFile does.
        const auto contentType = item["contentType"].toString().isEmpty() ? item["mimeType"].toString()
                                                                          : item["contentType"].toString();
        content.append(composer::assetContent(item["assetId"].toString(), item["name"].toString(), contentType));
  }
  message["content"] = content;
    // CanvasMediaComposer.tsx and GlobalChatStore.ts trySendMessage: a media turn
    // runs on the mode's model and carries no reasoning level.
    const auto provider = media ? m_mediaCatalog.selectedProvider() : m_provider;
    const auto model = media ? m_mediaCatalog.selectedModelId() : m_model;
  if (!provider.isEmpty()) {
    message["provider"] = provider;
  }
  if (!model.isEmpty()) {
    message["model"] = model;
  }
    if (media) {
        message["media_generation"] = composer::mediaRequest(m_mediaMode, mediaSettings(), provider, model);
    } else if (!m_reasoningEffort.isEmpty()) {
        message["reasoning_effort"] = m_reasoningEffort;
    }
  if (!m_hostContext.isEmpty()) {
    const auto workflowId = m_hostContext.value("workflow_id").toString();
    message["workflow_id"] = workflowId.isEmpty() ? QJsonValue(QJsonValue::Null) : QJsonValue(workflowId);
    const auto uiContext = m_hostContext.value("ui_context").toMap();
    if (!uiContext.isEmpty()) message["ui_context"] = QJsonObject::fromVariantMap(uiContext);
    const auto prompt = m_hostContext.value("system_prompt").toString();
    if (!prompt.isEmpty()) message["system_prompt"] = prompt;
  }
  if (!m_client.send({{"command", "chat_message"}, {"data", message}})) {
    return;
  }
  s.messages->upsert(message);
    s.lastPrompt = s.draft;
    s.lastAttachments = s.attachments;
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
    const auto ids = m_actions.keys();
    for (const auto &id : ids) {
      if (m_actions.value(id)["thread_id"] != m_selected) { continue; }
      auto part = m_actions.take(id);
      m_answeredActions.insert(id);
      part["actionId"] = id;
      part["pending"] = false;
      part["status"] = "Cancelled";
      state(m_selected).messages->addPart(part);
    }
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
bool ChatSession::sendHostRequest(const QString &command,
                                  const QJsonObject &data,
                                  const QString &requestId) {
  if (requestId.isEmpty() || !m_client.ready() || m_hostRequests.size() >= 16 ||
      m_hostRequests.contains(requestId)) return false;
  const auto epoch = m_client.epoch();
  m_hostRequests.insert(requestId, epoch);
  QTimer::singleShot(120000, this, [this, requestId, epoch] {
    if (m_hostRequests.value(requestId, 0) != epoch) return;
    m_hostRequests.remove(requestId);
    if (m_client.epoch() != epoch) return;
    emit hostResponseReceived({{"type", "rpc_response"}, {"request_id", requestId},
                               {"error", QJsonObject{{"message", "Host request timed out."}}}});
  });
  if (m_client.send({{"command", command}, {"request_id", requestId},
                     {"data", data}})) return true;
  m_hostRequests.remove(requestId);
  return false;
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
  if (action.isEmpty() || !m_client.ready()) {
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
    if (!approved && !text.trimmed().isEmpty()) {
      response["feedback"] = text.trimmed();
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
  m_answeredActions.insert(id);
  auto part = action;
  part["actionId"] = id;
  part["pending"] = false;
  part["status"] = kind != "secret_request" && approved ? "approved" : "declined";
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
      // native-rules #12: async callback captures raw this, not a QPointer
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
            item["contentType"] = value.toObject()["content_type"].toString(item["mimeType"].toString());
            if (!value.toObject()["name"].toString().isEmpty()) {
                item["name"] = value.toObject()["name"].toString();
            }
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
      // native-rules #12: async callback captures raw this, not a QPointer
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
void ChatSession::openResource(const QString &uri) {
  const QUrl url(uri);
  if (m_resourceKinds.contains(url.scheme()) && !url.host().isEmpty()) { emit resourceRequested(uri); }
}
void ChatSession::openMedia(const QVariantMap &locator) {
  const auto uri = locator.value("uri").toString();
  const auto asset = locator.value("asset_id", uri.startsWith("asset://") ? uri.mid(8) : QString()).toString();
  // native-rules #12: async callback captures raw this, not a QPointer
  auto open = [this](const QUrl &url) {
    // native-rules #12: async callback captures raw this, not a QPointer
    m_client.openMedia(url, [this](QJsonValue, const QString &error) { if (!error.isEmpty()) { fail(error); } });
  };
  if (!asset.isEmpty()) {
    // native-rules #12: async callback captures raw this, not a QPointer
    m_client.call("assets.get", {{"id", asset}}, false, [this, open](QJsonValue value, QString error) {
      if (!error.isEmpty()) { fail("Media unavailable"); return; }
      const auto url = value.toObject()["get_url"].toString();
      if (url.isEmpty()) { fail("Media source unavailable"); return; }
      open(QUrl(url));
    });
  } else if (!uri.isEmpty()) { open(QUrl(uri)); }
  else { fail("Media source unavailable"); }
}
void ChatSession::openExternal(const QUrl &url) {
  if (url.scheme() == "https" || url.scheme() == "http" ||
      url.scheme() == "mailto") {
    QDesktopServices::openUrl(url);
  } else {
    fail("This link scheme is not supported");
  }
}
void ChatSession::applyEvent(const QJsonObject &event) {
  const auto id = event["thread_id"].toString();
  const auto type = event["type"].toString();
  if (type == "rpc_response" &&
      m_hostRequests.remove(event["request_id"].toString())) {
    emit hostResponseReceived(event);
    return;
  }
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
  if (!s.uncertainReplay && s.messages->reduceNested(event)) {
    emit stateChanged();
    return;
  }
  if (type == "chunk") {
    if (s.uncertainReplay) {
      s.status = "interrupted";
      m_threads.setStatus(id, s.status);
      emit stateChanged();
      return;
    }
    if ((event["content"].isString() || event["done"].toBool()) &&
        event["sub_agent_call_id"].toString().isEmpty()) {
      s.messages->appendChunk(event["content"].toString(),
                              event["done"].toBool(), event["thinking"].toBool());
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
    s.messages->finishThinking();
    s.status = "error";
    s.error = event["message"].toString("Chat failed");
    s.messages->addPart({{"type", "error"}, {"text", s.error}});
  } else if (type == "generation_stopped") {
    s.messages->finishThinking();
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
    if (!event["args"].isObject()) {
        completeHostTool(callId, {}, "Invalid host tool input: args must be an object");
        return;
    }
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
      if (!actionId.trimmed().isEmpty() && !m_answeredActions.contains(actionId)) {
        m_actions[actionId] = event;
        part["actionId"] = actionId;
        part["pending"] = true;
      } else {
        part["pending"] = false;
        part["actionId"] = actionId;
        part["status"] = actionId.trimmed().isEmpty()
            ? "Cannot answer: the server supplied no approval ID." : "Already answered or cancelled";
      }
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
void ChatSession::setMediaMode(const QString &mode) {
    bool enabled = false;
    for (const auto &entry : composer::mediaModes()) {
        enabled = enabled || (entry.toMap()["id"] == mode && entry.toMap()["enabled"].toBool());
    }
    if (!enabled || mode == m_mediaMode) {
        return;
    }
    m_mediaMode = mode;
    if (composer::isMediaMode(mode)) {
        m_mediaCatalog.setFilter({}, composer::catalogTasks(mode));
        m_mediaCatalog.setMode(composer::catalogMode(mode));
    }
    emit stateChanged();
}
QVariantList ChatSession::mediaModes() const {
    return composer::mediaModes();
}
QVariantMap ChatSession::mediaSettings() const {
    return m_mediaSettings.value(m_mediaMode, composer::defaultSettings(m_mediaMode));
}
QString ChatSession::mediaModelName() const {
    const auto id = m_mediaCatalog.selectedModelId();
    if (id.isEmpty()) {
        return {};
    }
    const auto details = m_mediaCatalog.modelDetails(id, m_mediaCatalog.selectedProvider());
    return details.value("name").toString().isEmpty() ? id : details.value("name").toString();
}
QVariantList ChatSession::mediaChips() const {
    return composer::settingChips(m_mediaMode, mediaSettings(), m_mediaCatalog.constraints());
}
QString ChatSession::mediaModelHint() const {
    return composer::pickModelMessage(m_mediaMode);
}
QString ChatSession::mediaModelPlaceholder() const {
    return composer::modelPlaceholder(m_mediaMode);
}
void ChatSession::setReasoningEffort(const QString &effort) {
    if (effort != "" && effort != "low" && effort != "medium" && effort != "high") {
        return;
    }
    m_reasoningEffort = effort;
    emit stateChanged();
}
bool ChatSession::reasoningSupported() const {
    return composer::supportsReasoningEffort(m_provider, m_model);
}
QVariantList ChatSession::reasoningLevels() const {
    return composer::reasoningLevels();
}
void ChatSession::setMediaSetting(const QString &key, const QVariant &value) {
    if (!composer::isMediaMode(m_mediaMode)) {
        return;
    }
    auto settings = mediaSettings();
    if (!settings.contains(key)) {
        return;
    }
    bool offered = false;
    for (const auto &entry : mediaOptions(key)) {
        offered = offered || entry.toMap()["value"] == value;
    }
    if (!offered) {
        return;
    }
    settings[key] = value;
    m_mediaSettings[m_mediaMode] = settings;
    emit stateChanged();
}
QVariantList ChatSession::mediaOptions(const QString &key) const {
    return composer::settingOptions(m_mediaMode, key, m_mediaCatalog.constraints());
}
QVariantMap ChatSession::mediaRequest() const {
    if (!composer::isMediaMode(m_mediaMode)) {
        return {};
    }
    return composer::mediaRequest(m_mediaMode, mediaSettings(), m_mediaCatalog.selectedProvider(),
                                  m_mediaCatalog.selectedModelId())
        .toVariantMap();
}
// useAssetMentionSearch.ts: Saved is the library searched by the query, debounced
// by 150 ms. Recent holds the assets used in this session.
void ChatSession::searchAssets(const QString &query) {
    m_assetSearchOpen = true;
    if (query == m_assetQuery && (m_assetTimer->isActive() || !m_assetResults.isEmpty())) {
        return;
    }
    m_assetQuery = query;
    ++m_assetSearch;
    m_assetTimer->start();
    emit assetsChanged();
}
void ChatSession::loadMoreAssets() {
    if (m_assetSearchOpen && !m_assetCursor.isEmpty()) {
        requestAssets(true);
    }
}
void ChatSession::closeAssetSearch() {
    m_assetSearchOpen = false;
    ++m_assetSearch;
    m_assetTimer->stop();
    m_assetQuery.clear();
    m_assetResults.clear();
    m_assetCursor.clear();
    emit assetsChanged();
}
void ChatSession::requestAssets(bool append) {
    if (!m_client.ready() || !m_assetSearchOpen) {
        return;
    }
    const auto token = append ? m_assetSearch : ++m_assetSearch;
    QJsonObject input{{"query", m_assetQuery}, {"page_size", 24}, {"project_id", "default"}};
    if (append) {
        input["cursor"] = m_assetCursor;
    }
    // native-rules #12: async callback captures raw this, not a QPointer
    m_client.call("assets.search", input, false, [this, token, append](QJsonValue value, QString error) {
        if (token != m_assetSearch) {
            return;
        }
        if (!append) {
            m_assetResults.clear();
        }
        m_assetCursor.clear();
        if (error.isEmpty()) {
            for (const auto &entry : value.toObject()["assets"].toArray()) {
                // Folders are not attachable.
                if (entry.toObject()["content_type"] != "folder") {
                    m_assetResults.append(entry.toObject().toVariantMap());
                }
            }
            m_assetCursor = value.toObject()["next_cursor"].toString();
        }
        emit assetsChanged();
    });
}
QVariantList ChatSession::recentAssets() const {
    const auto query = m_assetQuery.trimmed().toLower();
    QVariantList matches;
    for (const auto &entry : m_recentAssets) {
        const auto asset = entry.toMap();
        const auto name = asset["name"].toString().isEmpty() ? asset["id"].toString() : asset["name"].toString();
        if (query.isEmpty() || name.toLower().contains(query)) {
            matches.append(asset);
        }
    }
    return matches;
}
// MediaChatComposer.tsx handleSelectAsset attaches the asset as an asset:// reference.
void ChatSession::attachAsset(const QVariantMap &asset) {
    if (m_selected.isEmpty() || asset["id"].toString().isEmpty()) {
        return;
    }
    const auto contentType = asset["content_type"].toString().isEmpty() ? QString("application/octet-stream")
                                                                        : asset["content_type"].toString();
    const auto name = asset["name"].toString().isEmpty() ? asset["id"].toString() : asset["name"].toString();
    state(m_selected).attachments.append(QVariantMap{{"id", QUuid::createUuid().toString(QUuid::Id128)},
                                                     {"name", name},
                                                     {"status", "ready"},
                                                     {"progress", 100},
                                                     {"mimeType", contentType},
                                                     {"contentType", contentType},
                                                     {"assetId", asset["id"]}});
    for (qsizetype i = 0; i < m_recentAssets.size(); ++i) {
        if (m_recentAssets[i].toMap()["id"] == asset["id"]) {
            m_recentAssets.removeAt(i);
            break;
        }
    }
    m_recentAssets.prepend(asset);
    while (m_recentAssets.size() > 24) {
        m_recentAssets.removeLast();
    }
    emit assetsChanged();
    emit stateChanged();
}
QVariantMap ChatSession::mentionTrigger(const QString &text, int caret) const {
    return composer::mentionTrigger(text, caret);
}
QVariantMap ChatSession::removeMention(const QString &text, int start, int end) const {
    return composer::removeMention(text, start, end);
}
// ThreadList.tsx: one header per relative-date group, none for a single thread.
QVariantList ChatSession::workflowThreadRows(const QString &query) const {
    const auto needle = query.trimmed().toLower();
    QVariantList rows;
    for (const auto &entry : workflowThreads()) {
        const auto row = entry.toMap();
        const auto text = (row["title"].toString() + " " + row["preview"].toString()).toLower();
        if (needle.isEmpty() || text.contains(needle)) {
            rows.append(row);
        }
    }
    const auto now = QDateTime::currentDateTime();
    QString previous;
    for (auto &entry : rows) {
        auto row = entry.toMap();
        const auto updated = QDateTime::fromString(row["updated_at"].toString(), Qt::ISODateWithMs);
        row["time"] = updated.isValid() ? updated.toLocalTime().toString("HH:mm") : QString();
        if (rows.size() > 1 && updated.isValid()) {
            const auto group = composer::dateGroup(updated, now);
            if (group != previous) {
                row["header"] = group;
                row["headerDate"] = composer::groupDate(updated);
                previous = group;
            }
        }
        entry = row;
    }
    return rows;
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
