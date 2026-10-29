#include "aiassist/AssistantSession.h"
#include "aiassist/AgentBridge.h"
#include "aiassist/AssistDocument.h"
#include "edit/ClipOps.h"
#include "server/ServerClient.h"
#include "server/ServerSource.h"
#include <QCryptographicHash>
#include <QDir>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QSaveFile>
#include <QSet>
#include <QSettings>
#include <QThread>
#include <QUuid>
#include <cmath>
AssistantSession::AssistantSession(QObject *parent)
    : QObject(parent), m_planningTimeout(this),
      m_socket(QString(), QWebSocketProtocol::VersionLatest, this),
      m_modeTimeout(this) {
  m_planningTimeout.setSingleShot(true);
  m_planningTimeout.setInterval(120000);
  connect(&m_planningTimeout, &QTimer::timeout, this, [this]() {
    if (!m_planRequestId.isEmpty()) {
      m_planRequestId.clear();
      m_planningReview = {};
      m_error = "The Director request timed out. Its result will not be "
                "applied or resent.";
      emit changed();
    }
  });
  m_modeTimeout.setSingleShot(true);
  m_modeTimeout.setInterval(5000);
  connect(&m_modeTimeout, &QTimer::timeout, this, [this] {
    m_error = "Server did not acknowledge text mode.";
    m_socket.abort();
    emit changed();
  });
  connect(&m_socket, &QWebSocket::connected, this, [this] {
    sendFrame(
        {{"command", "set_mode"}, {"data", QJsonObject{{"mode", "text"}}}});
    m_modeTimeout.start();
  });
  connect(&m_socket, &QWebSocket::textMessageReceived, this,
          [this](const QString &text) {
            const auto doc = QJsonDocument::fromJson(text.toUtf8());
            if (doc.isObject()) {
              receive(doc.object());
            }
          });
  connect(
      &m_socket, &QWebSocket::binaryMessageReceived, this,
      [this](const QByteArray &bytes) {
        // set_mode replies in the previous MsgPack mode before switching.
        if (bytes ==
                QByteArray::fromHex(
                    "81a76d657373616765b04d6f64652073657420746f2074657874") ||
            bytes == QByteArray::fromHex("de0001a76d657373616765b04d6f646520736"
                                         "57420746f2074657874")) {
          m_modeTimeout.stop();
          m_ready = true;
          sendFrame({{"type", "client_tools_manifest"},
                     {"tools", nt::aiassist::assistantTools()}});
          emit changed();
        }
      });
  connect(&m_socket, &QWebSocket::disconnected, this, [this] {
    m_modeTimeout.stop();
    m_ready = false;
    if (m_busy) {
      m_error = "Assistant disconnected. The turn was not resent.";
    }
    m_busy = false;
    emit changed();
  });
  connect(&m_socket, &QWebSocket::errorOccurred, this,
          [this](QAbstractSocket::SocketError) {
            m_error = m_socket.errorString();
            emit changed();
          });
}
AssistantSession::~AssistantSession() {
  m_socket.disconnect(this);
  m_socket.abort();
}
void AssistantSession::bindGenerationController(QObject *editor) {
  m_generationHost = editor;
  setGenerationController(
      editor ? editor->findChild<QObject *>("generationController") : nullptr);
}
void AssistantSession::setGenerationController(QObject *value) {
  if (m_generator == value) {
    return;
  }
  disconnect(m_generationConnection);
  m_generator = value;
  if (value) {
    m_generationConnection =
        connect(value, SIGNAL(changed()), this, SLOT(advanceBeatGeneration()));
  }
  emit changed();
}
void AssistantSession::setTimeline(TimelineModel *value) {
  if (m_timeline == value) {
    return;
  }
  stop();
  m_socket.abort();
  m_ready = false;
  if (m_timeline) {
    disconnect(m_timeline, nullptr, this, nullptr);
  }
  m_generationQueueActive = false;
  m_planningReview = {};
  m_planRequestId.clear();
  m_timeline = value;
  m_generation = value ? value->documentGeneration() : 0;
  m_threadId.clear();
  m_answer.clear();
  m_selected.clear();
  resetHistory();
  if (value) {
    connect(value, &TimelineModel::documentReplaced, this, [this] {
      m_generationQueueActive = false;
      m_planningReview = {};
      m_planRequestId.clear();
      stop();
      m_socket.abort();
      m_ready = false;
      m_threadId.clear();
      m_answer.clear();
      m_selected.clear();
      resetHistory();
      emit changed();
    });
  }
  emit changed();
}
bool AssistantSession::connectServer() {
  if (m_busy) {
    return false;
  }
  const auto target = nt::server::serverSaveTarget();
  if (!target || !m_timeline) {
    m_error = "Open a server timeline to use the assistant.";
    emit changed();
    return false;
  }
  if (!target->expectedInstance.isEmpty()) {
    m_error = "Assistant connections require an authenticated server "
              "connection without a scratch instance pin.";
    emit changed();
    return false;
  }
  m_socket.abort();
  m_ready = false;
  auto url = target->server;
  url.setScheme(url.scheme() == "https" ? "wss" : "ws");
  url.setPath("/ws");
  url.setQuery(QString{});
  url.setFragment(QString{});
  QNetworkRequest request(url);
  request.setRawHeader("X-Nodetool-Client", nt::server::kClientHeader);
  if (!target->token.isEmpty()) {
    request.setRawHeader("Authorization", "Bearer " + target->token.toUtf8());
  }
  m_socket.open(request);
  return true;
}
void AssistantSession::sendFrame(const QJsonObject &frame) {
  m_socket.sendTextMessage(
      QString::fromUtf8(QJsonDocument(frame).toJson(QJsonDocument::Compact)));
}
QJsonObject AssistantSession::message(const QString &text,
                                      const QString &threadId,
                                      const QString &timelineId,
                                      const QStringList &selected,
                                      const QString &provider,
                                      const QString &model) {
  return {
      {"command", "chat_message"},
      {"data",
       QJsonObject{
           {"id", QUuid::createUuid().toString(QUuid::Id128)},
           {"thread_id", threadId},
           {"role", "user"},
           {"content", text},
           {"provider", provider},
           {"model", model},
           {"workflow_id", timelineId},
           {"permission_mode", "default"},
           {"ui_context",
            QJsonObject{{"source", "timeline_assistant"},
                        {"focused",
                         QJsonObject{{"type", "timeline"}, {"id", timelineId}}},
                        {"selection",
                         QJsonObject{{"clip_ids", QJsonArray::fromStringList(
                                                      selected)}}}}}}}};
}
bool AssistantSession::send(const QString &text) {
  if (!m_ready || m_busy || m_loadingHistory || !m_timeline ||
      text.trimmed().isEmpty()) {
    return false;
  }
  if (m_provider.isEmpty() || m_model.isEmpty()) {
    m_error = "Choose a provider and model.";
    emit changed();
    return false;
  }
  if (m_threadId.isEmpty()) {
    m_threadId = QUuid::createUuid().toString(QUuid::Id128);
  }
  ++m_historyEpoch;
  m_loadingHistory = false;
  if (!m_answer.isEmpty()) {
    m_history += "Assistant:\n" + m_answer + "\n\n";
  }
  m_history += "You:\n" + text + "\n\n";
  m_generation = m_timeline->documentGeneration();
  m_answer.clear();
  m_error.clear();
  m_busy = true;
  sendFrame(message(text, m_threadId,
                    m_timeline->timeline().raw.value("id").toString(),
                    m_selected, m_provider, m_model));
  emit changed();
  return true;
}
void AssistantSession::stop() {
  if (m_loadingHistory) {
    ++m_historyEpoch;
    m_loadingHistory = false;
  }
  if (m_busy && m_ready) {
    sendFrame({{"command", "stop"},
               {"data", QJsonObject{{"thread_id", m_threadId}}}});
    // End this socket scope so late tool calls cannot enter a later turn.
    // Keep the persisted thread so reconnecting continues its conversation.
    m_socket.close();
    m_ready = false;
  }
  m_busy = false;
  m_approvalId.clear();
  m_approvalText.clear();
  emit changed();
}
void AssistantSession::approve(bool allow) {
  if (m_approvalId.isEmpty()) {
    return;
  }
  sendFrame({{"type", m_planApproval ? "plan_approval_response"
                                     : "tool_approval_response"},
             {"approval_id", m_approvalId},
             {"decision", m_planApproval ? (allow ? "approve" : "reject")
                                         : (allow ? "allow" : "deny")}});
  m_approvalId.clear();
  m_approvalText.clear();
  emit changed();
}
void AssistantSession::receive(const QJsonObject &frame) {
  if (frame.value("type").toString() == "rpc_response" &&
      !m_planRequestId.isEmpty() &&
      frame.value("request_id").toString() == m_planRequestId) {
    m_planRequestId.clear();
    m_planningTimeout.stop();
    if (!m_timeline ||
        m_timeline->documentGeneration() != m_planningGeneration ||
        m_timeline->timeline().raw != m_planningObserved) {
      m_error = "The timeline changed while the Director was planning.";
      m_planningReview = {};
    } else if (frame.value("error").isObject()) {
      m_error = frame.value("error").toObject().value("message").toString();
      m_planningReview = {};
    } else {
      m_planningReview = {
          {"kind", "planCandidate"},
          {"beats", nt::aiassist::assistantDirectorBeats(
                        m_planningObserved, frame.value("result").toObject())},
          {"requiresApproval", true},
          {"requestCount", 0},
          {"costKnown", true},
          {"estimatedCredits", 0}};
    }
    emit changed();
    return;
  }
  if (frame.value("message").toString() == "Mode set to text") {
    m_modeTimeout.stop();
    m_ready = true;
    sendFrame({{"type", "client_tools_manifest"},
               {"tools", nt::aiassist::assistantTools()}});
    emit changed();
    return;
  }
  if (frame.value("type").toString() == "ping") {
    sendFrame({{"type", "pong"}});
    return;
  }
  if (frame.value("thread_id").toString() != m_threadId || !m_timeline ||
      m_generation != m_timeline->documentGeneration()) {
    return;
  }
  const auto type = frame.value("type").toString();
  if (!m_busy) {
    return;
  }
  if (type == "chunk") {
    m_answer += frame.value("content").toString();
    if (frame.value("done").toBool()) {
      m_busy = false;
    }
  } else if (type == "message" &&
             frame.value("role").toString() == "assistant" &&
             m_answer.isEmpty()) {
    const auto content = frame.value("content");
    if (content.isString()) {
      m_answer = content.toString();
    } else {
      for (const auto &part : content.toArray()) {
        const auto item = part.toObject();
        if (item.value("type").toString() == "text") {
          m_answer += item.value("text").toString();
        }
      }
    }
  } else if (type == "plan_approval_request") {
    m_planApproval = true;
    m_approvalId = frame.value("approval_id").toString();
    const auto plan = frame.value("plan").toObject();
    m_approvalText = plan.value("title").toString();
    for (const auto &task : plan.value("tasks").toArray()) {
      m_approvalText += "\n" + task.toObject().value("title").toString();
    }
  } else if (type == "tool_approval_request") {
    m_planApproval = false;
    m_approvalId = frame.value("approval_id").toString();
    m_approvalText =
        frame.value("description").toString(frame.value("message").toString());
  } else if (type == "generation_stopped") {
    m_busy = false;
  } else if (type == "error") {
    m_error = frame.value("message").toString();
    m_busy = false;
  } else if (type == "tool_call") {
    auto result = executeToolScoped(frame.value("name").toString(),
                                    frame.value("args").toObject(),
                                    frame.value("tool_call_id").toString());
    if (result.value("deferred").toBool()) {
      emit changed();
      return;
    }
    sendFrame({{"type", "tool_result"},
               {"tool_call_id", frame.value("tool_call_id")},
               {"ok", result.value("ok")},
               {"result", result},
               {"error", result.value("error")}});
  }
  emit changed();
}

namespace {
bool productionPrefix(const QString &value) {
  static const QRegularExpression prefix("^[0-9a-f]{12}$");
  return value.size() == 12 && prefix.match(value).hasMatch();
}
bool requirementHasResources(const QJsonObject &value) {
  if (!value.value("reference_bindings").toArray().isEmpty()) {
    return true;
  }
  for (const auto &item : value.value("protected_inputs").toArray()) {
    const auto input = item.toObject();
    if (input.contains("asset_id") || input.contains("entity_id")) {
      return true;
    }
  }
  const auto speech = value.value("speech_binding").toObject();
  if (speech.contains("audio_asset_id") ||
      productionPrefix(speech.value("script_line_id").toString()) ||
      productionPrefix(speech.value("speaker_id").toString())) {
    return true;
  }
  for (const auto &item : value.value("references").toArray()) {
    if (item.toObject().value("uri").toString().startsWith("asset://")) {
      return true;
    }
  }
  return false;
}
QJsonObject canonicalPlanningBoundary(const QString &operation,
                                      const QJsonObject &raw,
                                      const QJsonObject &arguments) {
  QJsonObject document = raw, payload = arguments;
  auto setup = raw.value("setup").toObject();
  auto beats = operation == "ui_timeline_plan_beats"
                   ? arguments.value("beats").toArray()
                   : setup.value("beats").toArray();
  bool resources = false;
  for (qsizetype i = 0; i < beats.size(); ++i) {
    if (!beats.at(i).isObject()) {
      return {{"error", "Each beat must be an object."}};
    }
    auto beat = beats.at(i).toObject();
    if (beat.contains("production")) {
      const auto validated =
          nt::aiassist::assistantValidateProduction(beat.value("production"));
      if (validated.contains("error")) {
        return validated;
      }
      const auto production = validated.value("value").toObject();
      beat.insert("production", production);
      resources = resources || requirementHasResources(production);
    }
    beats[i] = beat;
  }
  if (operation == "ui_timeline_plan_beats") {
    payload.insert("beats", beats);
  } else {
    setup.insert("beats", beats);
    auto creative = setup.value("creative_context").toObject();
    if (creative.contains("reference_bindings")) {
      const auto validated =
          nt::aiassist::assistantValidateProduction(QJsonObject{
              {"reference_bindings", creative.value("reference_bindings")}});
      if (validated.contains("error")) {
        return validated;
      }
      creative.insert(
          "reference_bindings",
          validated.value("value").toObject().value("reference_bindings"));
      setup.insert("creative_context", creative);
      resources = resources ||
                  !creative.value("reference_bindings").toArray().isEmpty();
    }
    if (setup.contains("entityIds")) {
      if (!setup.value("entityIds").isArray()) {
        return {{"error",
                 "setup.entityIds must be an array of asset identifiers."}};
      }
      for (const auto &id : setup.value("entityIds").toArray()) {
        if (!id.isString() || id.toString().trimmed().isEmpty()) {
          return {
              {"error",
               "setup.entityIds must contain non-empty asset identifiers."}};
        }
      }
      resources = resources || !setup.value("entityIds").toArray().isEmpty();
    }
    document.insert("setup", setup);
  }
  return {
      {"arguments", payload}, {"document", document}, {"resources", resources}};
}
struct PlanningResourceNormalizer {
  AssistantSession::HistoryCall read;
  QJsonObject snapshot;
  QHash<QString, QString> assetIds;
  QList<QJsonObject> scripts;
  bool scriptsLoaded = false;
  QString error;
  PlanningResourceNormalizer(AssistantSession::HistoryCall transport,
                             QJsonObject raw)
      : read(std::move(transport)), snapshot(std::move(raw)) {}
  bool fail(const QString &message) {
    if (error.isEmpty()) {
      error = message;
    }
    return false;
  }
  bool asset(QString &id) {
    if (assetIds.contains(id)) {
      id = assetIds.value(id);
      return true;
    }
    const auto result = read("assets.get", {{"id", id}});
    if (!result.ok()) {
      return fail(result.describe());
    }
    const auto row = result.data.toObject();
    if (!row.value("id").isString() || row.value("id").toString().isEmpty()) {
      return fail("Asset lookup returned no authoritative identifier.");
    }
    const auto full = row.value("id").toString();
    if (!nt::aiassist::resolveId(id, {full})) {
      return fail(
          "Asset lookup returned an identity outside the requested scope.");
    }
    assetIds.insert(id, full);
    assetIds.insert(full, full);
    id = full;
    return true;
  }
  bool assetField(QJsonObject &object, const QString &field) {
    if (!object.contains(field)) {
      return true;
    }
    auto id = object.value(field).toString();
    if (!asset(id)) {
      return false;
    }
    object.insert(field, id);
    return true;
  }
  bool scriptContext() {
    if (scriptsLoaded) {
      return !scripts.isEmpty() || fail("No linked Script context is available "
                                        "to resolve line or speaker prefixes.");
    }
    scriptsLoaded = true;
    QSet<QString> ids;
    const auto listing =
        read("scripts.list", {{"timelineId", snapshot.value("id")}});
    if (!listing.ok()) {
      return fail(listing.describe());
    }
    if (!listing.data.isArray()) {
      return fail("Linked Script listing returned an invalid response.");
    }
    for (const auto &value : listing.data.toArray()) {
      const auto id = value.toObject().value("id").toString();
      if (!id.isEmpty()) {
        ids.insert(id);
      }
    }
    for (const auto &value : snapshot.value("clips").toArray()) {
      const auto id = value.toObject().value("scriptId").toString();
      if (!id.isEmpty()) {
        ids.insert(id);
      }
    }
    for (const auto &id : ids) {
      const auto result = read("scripts.get", {{"id", id}});
      if (!result.ok()) {
        if (result.error.code == "NOT_FOUND" ||
            result.error.code == "FORBIDDEN" ||
            result.error.code == "UNAUTHORIZED") {
          continue;
        }
        return fail(result.describe());
      }
      const auto script = result.data.toObject();
      if (script.value("id").toString() != id ||
          !script.value("document").isObject()) {
        return fail("Linked Script lookup returned an invalid identity.");
      }
      scripts.append(script);
    }
    return !scripts.isEmpty() || fail("No linked Script context is available "
                                      "to resolve line or speaker prefixes.");
  }
  bool speech(QJsonObject &binding) {
    if (!assetField(binding, "audio_asset_id")) {
      return false;
    }
    const bool shortLine =
                   productionPrefix(binding.value("script_line_id").toString()),
               shortSpeaker =
                   productionPrefix(binding.value("speaker_id").toString());
    if (!shortLine && !shortSpeaker) {
      return true;
    }
    if (!scriptContext()) {
      return false;
    }
    QStringList lineIds;
    for (const auto &script : scripts) {
      for (const auto &section :
           script.value("document").toObject().value("sections").toArray()) {
        for (const auto &line : section.toObject().value("lines").toArray()) {
          lineIds.append(line.toObject().value("id").toString());
        }
      }
    }
    lineIds.removeDuplicates();
    if (shortLine) {
      const auto resolved = nt::aiassist::resolveId(
          binding.value("script_line_id").toString(), lineIds);
      if (!resolved) {
        return fail("Script line prefix is unavailable or ambiguous in this "
                    "timeline's linked Scripts.");
      }
      binding.insert("script_line_id", *resolved);
    }
    if (shortSpeaker) {
      QStringList speakerIds;
      int owners = 0;
      for (const auto &script : scripts) {
        bool lineOwned = !binding.contains("script_line_id");
        for (const auto &section :
             script.value("document").toObject().value("sections").toArray()) {
          for (const auto &line : section.toObject().value("lines").toArray()) {
            if (line.toObject().value("id") ==
                binding.value("script_line_id")) {
              lineOwned = true;
            }
          }
        }
        if (!lineOwned) {
          continue;
        }
        ++owners;
        for (const auto &speaker :
             script.value("document").toObject().value("cast").toArray()) {
          speakerIds.append(speaker.toObject().value("id").toString());
        }
      }
      if (binding.contains("script_line_id") && owners != 1) {
        return fail(
            "The Script line does not identify one authorized cast scope.");
      }
      speakerIds.removeDuplicates();
      const auto resolved = nt::aiassist::resolveId(
          binding.value("speaker_id").toString(), speakerIds);
      if (!resolved) {
        return fail("Speaker prefix is unavailable or ambiguous in the linked "
                    "Script cast.");
      }
      binding.insert("speaker_id", *resolved);
    }
    return true;
  }
  bool requirement(QJsonObject &value) {
    for (const auto *field : {"reference_bindings", "protected_inputs"}) {
      auto items = value.value(field).toArray();
      for (qsizetype i = 0; i < items.size(); ++i) {
        auto item = items.at(i).toObject();
        if (!assetField(item, "asset_id") || !assetField(item, "entity_id")) {
          return false;
        }
        items[i] = item;
      }
      if (value.contains(field)) {
        value.insert(field, items);
      }
    }
    if (value.contains("speech_binding")) {
      auto binding = value.value("speech_binding").toObject();
      if (!speech(binding)) {
        return false;
      }
      value.insert("speech_binding", binding);
    }
    static const QRegularExpression locator(
        "^asset://([0-9a-f]{12}|[0-9a-f]{32})(\\.[^/?#]+)?$");
    auto references = value.value("references").toArray();
    for (qsizetype i = 0; i < references.size(); ++i) {
      auto reference = references.at(i).toObject();
      const auto uri = reference.value("uri").toString();
      const auto match = locator.match(uri);
      if (match.hasMatch()) {
        auto id = match.captured(1);
        if (!asset(id)) {
          return false;
        }
        reference.insert("uri", "asset://" + id + match.captured(2));
        references[i] = reference;
      }
    }
    if (value.contains("references")) {
      value.insert("references", references);
    }
    return true;
  }
};
} // namespace
QJsonObject AssistantSession::normalizePlanningReferences(
    const QString &operation, const QJsonObject &original,
    const QJsonObject &canonical, const QString &toolCallId) {
  if (m_loadingHistory) {
    return {{"ok", false},
            {"error", "Wait for the current scoped document lookup."}};
  }
  auto transport = m_historyCall;
  if (!transport) {
    const auto target = nt::server::serverSaveTarget();
    if (!target) {
      return {{"ok", false},
              {"error",
               "Open a server timeline to resolve production references."}};
    }
    transport = [target](const QString &procedure, const QJsonObject &input) {
      nt::server::ServerClient client(target->server, target->token);
      client.setExpectedInstance(target->expectedInstance);
      return client.query(procedure, input);
    };
  }
  const auto generation = m_timeline->documentGeneration();
  const QPointer<TimelineModel> model = m_timeline;
  const QPointer<AssistantSession> self(this);
  const auto epoch = ++m_historyEpoch;
  const auto threadId = m_threadId;
  m_loadingHistory = true;
  emit changed();
  auto *worker = QThread::create([self, model, generation, epoch, threadId,
                                  transport, operation, original, canonical,
                                  toolCallId]() {
    PlanningResourceNormalizer resolver{transport, original};
    auto document = canonical.value("document").toObject(),
         arguments = canonical.value("arguments").toObject();
    auto setup = document.value("setup").toObject();
    auto beats = operation == "ui_timeline_plan_beats"
                     ? arguments.value("beats").toArray()
                     : setup.value("beats").toArray();
    for (qsizetype i = 0; i < beats.size() && resolver.error.isEmpty(); ++i) {
      auto beat = beats.at(i).toObject();
      if (beat.contains("production")) {
        auto production = beat.value("production").toObject();
        if (!resolver.requirement(production)) {
          break;
        }
        beat.insert("production", production);
      }
      beats[i] = beat;
    }
    if (operation == "ui_timeline_plan_beats") {
      arguments.insert("beats", beats);
    } else {
      setup.insert("beats", beats);
      auto creative = setup.value("creative_context").toObject();
      if (creative.contains("reference_bindings")) {
        QJsonObject production{
            {"reference_bindings", creative.value("reference_bindings")}};
        if (resolver.error.isEmpty() && resolver.requirement(production)) {
          creative.insert("reference_bindings",
                          production.value("reference_bindings"));
          setup.insert("creative_context", creative);
        }
      }
      auto entities = setup.value("entityIds").toArray();
      for (qsizetype i = 0; i < entities.size() && resolver.error.isEmpty();
           ++i) {
        auto id = entities.at(i).toString();
        if (!resolver.asset(id)) {
          break;
        }
        entities[i] = id;
      }
      if (setup.contains("entityIds")) {
        setup.insert("entityIds", entities);
      }
      document.insert("setup", setup);
    }
    QJsonObject prepared;
    if (operation == "ui_timeline_generate_from_beats" &&
        resolver.error.isEmpty()) {
      prepared = nt::aiassist::assistantPrepareBeatCut(document, arguments);
      if (prepared.contains("error")) {
        resolver.error = prepared.value("error").toString();
      }
    }
    if (!self) {
      return;
    }
    QMetaObject::invokeMethod(
        self,
        [self, model, generation, epoch, threadId, operation, original,
         arguments, prepared, toolCallId, error = resolver.error]() {
          if (!self) {
            return;
          }
          QJsonObject result;
          const bool current = self->m_historyEpoch == epoch && model &&
                               self->m_timeline == model &&
                               model->documentGeneration() == generation &&
                               model->timeline().raw == original;
          if (self->m_historyEpoch == epoch) {
            self->m_loadingHistory = false;
          }
          if (!current) {
            result = {{"ok", false},
                      {"error", "The timeline changed while production "
                                "references were being resolved."}};
          } else if (!error.isEmpty()) {
            result = {{"ok", false}, {"error", error}};
          } else if (operation == "ui_timeline_plan_beats") {
            const auto after = nt::aiassist::assistantPlanningEdit(
                operation, original, arguments);
            if (after == original ||
                !model->applyEdit("assistant." + operation, arguments)) {
              result = {{"ok", false},
                        {"error",
                         "The normalized beat plan could not be committed."}};
            } else {
              result = {{"ok", true},
                        {"setup", model->timeline().raw.value("setup")},
                        {"clipsCreated", 0},
                        {"jobsStarted", 0}};
            }
          } else {
            self->m_planningObserved = original;
            self->m_planningGeneration = generation;
            self->m_preparedDocument = prepared.value("document").toObject();
            self->m_generationRequests = prepared.value("requests").toArray();
            self->m_planningReview = prepared;
            self->m_planningReview.remove("document");
            self->m_planningReview.insert("kind", "generationBatch");
            self->m_planningReview.insert("requiresApproval", true);
            self->m_planningReview.insert("requestCount",
                                          self->m_generationRequests.size());
            result = {{"ok", true},
                      {"staged", true},
                      {"approvalRequired", true},
                      {"review", self->m_planningReview}};
          }
          if (!result.value("ok").toBool() && self->m_historyEpoch == epoch) {
            self->m_error = result.value("error").toString();
          }
          if (!toolCallId.isEmpty() && self->m_threadId == threadId) {
            self->sendFrame({{"type", "tool_result"},
                             {"tool_call_id", toolCallId},
                             {"ok", result.value("ok")},
                             {"result", result},
                             {"error", result.value("error")}});
          }
          emit self->changed();
        },
        Qt::QueuedConnection);
  });
  connect(worker, &QThread::finished, worker, &QObject::deleteLater);
  worker->start();
  return {{"ok", true},
          {"started", true},
          {"deferred", true},
          {"normalizing", true}};
}

QJsonObject AssistantSession::executeTool(const QString &name,
                                          const QJsonObject &args) {
  return executeToolScoped(name, args, {});
}
QJsonObject AssistantSession::executeToolScoped(const QString &name,
                                                const QJsonObject &args,
                                                const QString &toolCallId) {
  const auto failure = [](const QString &message) {
    return QJsonObject{{"ok", false}, {"error", message}};
  };
  if (!m_timeline || m_generation != m_timeline->documentGeneration()) {
    return failure("The timeline changed. Read its state again.");
  }
  const auto raw = m_timeline->timeline().raw;
  const auto sequenceId = raw.value("id").toString();
  if (!nt::aiassist::resolveId(args.value("timeline_id").toString(),
                               {sequenceId})) {
    return failure("This timeline is not open in the assistant.");
  }
  if (!m_generator && m_generationHost) {
    setGenerationController(
        m_generationHost->findChild<QObject *>("generationController"));
  }
  const auto generatorMatches = [this]() {
    return m_generator && m_generator->thread() == thread() &&
           m_generator->property("timeline").value<TimelineModel *>() ==
               m_timeline;
  };
  const auto generationState = [this, &generatorMatches]() {
    if (!generatorMatches()) {
      return QJsonObject{};
    }
    return QJsonObject{
        {"state", m_generator->property("state").toString()},
        {"busy", m_generator->property("busy").toBool()},
        {"resolving", m_generator->property("resolving").toBool()},
        {"ready", m_generator->property("ready").toBool()},
        {"error", m_generator->property("error").toString()},
        {"candidates", QJsonArray::fromVariantList(
                           m_generator->property("candidates").toList())}};
  };
  const auto requireGenerator = [this, &generatorMatches]() -> QString {
    if (!generatorMatches()) {
      return "The timeline generation controller is unavailable.";
    }
    if (m_generator->property("busy").toBool() ||
        m_generator->property("resolving").toBool()) {
      return "Wait for the current generation or media resolution.";
    }
    if (!m_generator->property("ready").toBool()) {
      QMetaObject::invokeMethod(m_generator, "open", Qt::DirectConnection);
      return "Generation is connecting. Read timeline state and retry when "
             "generation.ready is true.";
    }
    return {};
  };
  const auto started = [&failure, &generationState]() {
    const auto state = generationState();
    if (!state.value("busy").toBool() && !state.value("resolving").toBool()) {
      return failure(
          state.value("error").toString("Generation did not start."));
    }
    return QJsonObject{{"ok", true}, {"started", true}, {"generation", state}};
  };
  if (name == "ui_timeline_set_setup" || name == "ui_timeline_update_beat" ||
      name == "ui_timeline_remove_beat" ||
      (name == "ui_timeline_plan_beats" &&
       !args.value("beats").toArray().isEmpty())) {
    auto normalizedArgs = args;
    if (name == "ui_timeline_plan_beats") {
      const auto canonical = canonicalPlanningBoundary(name, raw, args);
      if (canonical.contains("error")) {
        return failure(canonical.value("error").toString());
      }
      if (canonical.value("resources").toBool()) {
        return normalizePlanningReferences(name, raw, canonical, toolCallId);
      }
      normalizedArgs = canonical.value("arguments").toObject();
    }
    const auto after =
        nt::aiassist::assistantPlanningEdit(name, raw, normalizedArgs);
    if (after == raw) {
      return failure("Setup or beat edit is invalid or unchanged.");
    }
    if (!m_timeline->applyEdit("assistant." + name, normalizedArgs)) {
      return failure("The plan could not be committed.");
    }
    return {{"ok", true},
            {"setup", m_timeline->timeline().raw.value("setup")},
            {"clipsCreated", 0},
            {"jobsStarted", 0}};
  }
  if (name == "ui_timeline_plan_beats") {
    if (!m_planRequestId.isEmpty()) {
      return failure("The Director is already planning. Cancel it or wait.");
    }
    const auto request = nt::aiassist::assistantDirectorRequest(
        raw, args.value("replan").toBool(), "nodetool", "nodetool/director");
    if (request.contains("error")) {
      return failure(request.value("error").toString());
    }
    m_planningObserved = raw;
    m_planningGeneration = m_timeline->documentGeneration();
    m_planningReview = {{"kind", "directorRequest"},
                        {"request", request},
                        {"provider", request.value("provider")},
                        {"model", request.value("model")},
                        {"requestCount", 1},
                        {"requiresApproval", true},
                        {"costKnown", false},
                        {"estimatedCredits", QJsonValue::Null}};
    emit changed();
    return {{"ok", true},
            {"staged", true},
            {"approvalRequired", true},
            {"review", m_planningReview}};
  }
  if (name == "ui_timeline_generate_from_beats") {
    const auto problem = requireGenerator();
    if (!problem.isEmpty()) {
      return failure(problem);
    }
    if (m_generationQueueActive || !m_planRequestId.isEmpty()) {
      return failure("Wait for the current planning or generation batch.");
    }
    auto choices = args;
    const auto settings =
        raw.value("setup").toObject().value("generation_settings").toObject();
    QSettings remembered;
    if (settings.isEmpty()) {
      for (const auto *field : {"provider", "model"}) {
        if (!choices.contains(field)) {
          const auto value =
              remembered.value(QString("generation/video/") + field).toString();
          if (!value.isEmpty()) {
            choices.insert(field, value);
          }
        }
      }
      for (const auto &field : {std::pair{"voiceProvider", "provider"},
                                std::pair{"voiceModel", "model"}}) {
        const auto value =
            remembered.value(QString("generation/audio/") + field.second)
                .toString();
        if (!value.isEmpty()) {
          choices.insert(field.first, value);
        }
      }
    }
    for (const auto &field : {std::pair{"musicProvider", "provider"},
                              std::pair{"musicModel", "model"}}) {
      const auto value =
          remembered.value(QString("generation/music/") + field.second)
              .toString();
      if (!value.isEmpty()) {
        choices.insert(field.first, value);
      }
    }
    const auto canonical = canonicalPlanningBoundary(name, raw, choices);
    if (canonical.contains("error")) {
      return failure(canonical.value("error").toString());
    }
    if (canonical.value("resources").toBool()) {
      return normalizePlanningReferences(name, raw, canonical, toolCallId);
    }
    const auto prepared = nt::aiassist::assistantPrepareBeatCut(
        canonical.value("document").toObject(), choices);
    if (prepared.contains("error")) {
      return failure(prepared.value("error").toString());
    }
    m_planningObserved = raw;
    m_planningGeneration = m_timeline->documentGeneration();
    m_preparedDocument = prepared.value("document").toObject();
    m_generationRequests = prepared.value("requests").toArray();
    m_planningReview = prepared;
    m_planningReview.remove("document");
    m_planningReview.insert("kind", "generationBatch");
    m_planningReview.insert("requiresApproval", true);
    m_planningReview.insert("requestCount", m_generationRequests.size());
    emit changed();
    return {{"ok", true},
            {"staged", true},
            {"approvalRequired", true},
            {"review", m_planningReview}};
  }
  if (name == "ui_timeline_generate_clip") {
    const auto kind = args.value("kind").toString();
    if (kind != "text-to-image" && kind != "text-to-video" &&
        kind != "text-to-audio") {
      return failure("Unsupported generation kind.");
    }
    const bool generate = args.value("autoGenerate").toBool(true);
    if (!args.value("prompt").isString()) {
      return failure("prompt must be a string.");
    }
    if (generate) {
      if (args.value("provider").toString().trimmed().isEmpty() ||
          args.value("model").toString().trimmed().isEmpty() ||
          args.value("prompt").toString().trimmed().isEmpty()) {
        return failure(
            "Provide a provider, model and nonempty prompt to generate media.");
      }
      if (kind == "text-to-audio" &&
          args.value("voice").toString().trimmed().isEmpty()) {
        return failure("Provide voice for text-to-audio.");
      }
      const auto problem = requireGenerator();
      if (!problem.isEmpty()) {
        return failure(problem);
      }
    }
    auto payload = args;
    if (args.contains("trackId")) {
      QStringList ids;
      for (const auto &value : raw.value("tracks").toArray()) {
        ids.append(value.toObject().value("id").toString());
      }
      const auto resolved =
          nt::aiassist::resolveId(args.value("trackId").toString(), ids);
      if (!resolved) {
        return failure("Track target is missing or ambiguous.");
      }
      payload.insert("trackId", *resolved);
    }
    for (const auto *field : {"durationMs", "width", "height"}) {
      if (args.contains(field) &&
          (!args.value(field).isDouble() ||
           !std::isfinite(args.value(field).toDouble()) ||
           args.value(field).toDouble() <= 0)) {
        return failure(QString(field) + " must be positive.");
      }
    }
    const auto clipId = nt::edit::newId();
    payload.insert("id", clipId);
    if (!m_timeline->applyEdit("assistant.generateClip", payload)) {
      return failure("A generated draft could not be placed on that track.");
    }
    if (!generate) {
      return QJsonObject{{"ok", true}, {"started", false}, {"clipId", clipId}};
    }
    if (!QMetaObject::invokeMethod(m_generator, "regenerate",
                                   Qt::DirectConnection,
                                   Q_ARG(QString, clipId))) {
      return failure("Generation controller does not support regeneration. The "
                     "draft remains in the timeline.");
    }
    auto result = started();
    result.insert("clipId", clipId);
    return result;
  }
  if (name == "ui_timeline_get_state") {
    QJsonArray tracks;
    QHash<QString, int> clipCounts;
    for (const auto &value : raw.value("clips").toArray()) {
      ++clipCounts[value.toObject().value("trackId").toString()];
    }
    for (const auto &value : raw.value("tracks").toArray()) {
      auto track = value.toObject();
      track.insert("clipCount", clipCounts.value(track.value("id").toString()));
      tracks.append(track);
    }
    QJsonArray clips;
    for (const auto &value : raw.value("clips").toArray()) {
      auto clip = value.toObject();
      clip.insert("endMs", clip.value("startMs").toDouble() +
                               clip.value("durationMs").toDouble());
      clips.append(clip);
    }
    return {{"ok", true},
            {"sequenceId", sequenceId},
            {"fps", m_timeline->fps()},
            {"width", m_timeline->canvasWidth()},
            {"height", m_timeline->canvasHeight()},
            {"durationMs", m_timeline->durationMs()},
            {"playheadMs", m_playheadMs},
            {"selectedClipIds", QJsonArray::fromStringList(m_selected)},
            {"tracks", tracks},
            {"clips", clips},
            {"markers", raw.value("markers")},
            {"mediaTracks", raw.value("mediaTracks")},
            {"generation", generationState()},
            {"setup", raw.value("setup")},
            {"planningReview", m_planningReview},
            {"pendingDocumentRead", m_loadingHistory},
            {"assistantError", m_error}};
  }
  if (name != "ui_timeline_move_clip" && name != "ui_timeline_delete_clip" &&
      name != "ui_timeline_split_clip" &&
      name != "ui_timeline_generatively_edit_clip" &&
      name != "ui_timeline_apply_take" &&
      name != "ui_timeline_set_clip_binding") {
    return failure("Unsupported native timeline tool.");
  }
  QString target = args.value(name == "ui_timeline_generatively_edit_clip" ||
                                      name == "ui_timeline_apply_take"
                                  ? "clip_id"
                                  : "target")
                       .toString();
  if (target == "selected") {
    if (m_selected.size() != 1) {
      return failure("Select exactly one clip or pass its id.");
    }
    target = m_selected.first();
  }
  QStringList ids;
  const auto clips = raw.value("clips").toArray();
  for (const auto &clip : clips) {
    ids.append(clip.toObject().value("id").toString());
  }
  auto resolved = nt::aiassist::resolveId(target, ids);
  if (!resolved) {
    static const QRegularExpression resourcePrefix("^[0-9a-f]{12}$");
    if (target.size() == 12 && resourcePrefix.match(target).hasMatch()) {
      return failure("Clip prefix is missing or ambiguous.");
    }
    QStringList matches;
    for (const auto &value : clips) {
      const auto clip = value.toObject();
      if (clip.value("name").toString().compare(target, Qt::CaseInsensitive) ==
          0) {
        matches.append(clip.value("id").toString());
      }
    }
    if (matches.size() == 1) {
      resolved = matches.first();
    }
  }
  if (!resolved) {
    return failure("Clip target is missing or ambiguous.");
  }
  if (name == "ui_timeline_generatively_edit_clip") {
    if (args.value("instruction").toString().trimmed().isEmpty() ||
        args.value("provider").toString().trimmed().isEmpty() ||
        args.value("model").toString().trimmed().isEmpty()) {
      return failure(
          "Provide instruction and a video-edit provider/model pair.");
    }
    const auto problem = requireGenerator();
    if (!problem.isEmpty()) {
      return failure(problem);
    }
    const QVariantMap options{
        {"instruction", args.value("instruction").toString()},
        {"provider", args.value("provider").toString()},
        {"model", args.value("model").toString()}};
    if (!QMetaObject::invokeMethod(
            m_generator, "submitMediaEdit", Qt::DirectConnection,
            Q_ARG(QString, *resolved), Q_ARG(QVariantMap, options))) {
      return failure("Media-edit controller is unavailable.");
    }
    return started();
  }
  if (name == "ui_timeline_apply_take") {
    if (!generatorMatches()) {
      return failure("The timeline generation controller is unavailable.");
    }
    if (m_generator->property("busy").toBool() ||
        m_generator->property("resolving").toBool()) {
      return failure("Wait for the current generation or media resolution.");
    }
    QStringList takeIds;
    for (const auto &value : m_generator->property("candidates").toList()) {
      const auto take = value.toMap();
      if (take.value("clipId").toString() == *resolved) {
        takeIds.append(take.value("id").toString());
      }
    }
    for (const auto &value : clips) {
      const auto clip = value.toObject();
      if (clip.value("id").toString() != *resolved) {
        continue;
      }
      for (const auto &take : clip.value("versions").toArray()) {
        takeIds.append(take.toObject().value("id").toString());
      }
    }
    takeIds.removeDuplicates();
    const auto takeId =
        nt::aiassist::resolveId(args.value("take_id").toString(), takeIds);
    if (!takeId) {
      return failure("Take target is missing or ambiguous for this clip.");
    }
    if (!QMetaObject::invokeMethod(m_generator, "apply", Qt::DirectConnection,
                                   Q_ARG(QString, *resolved),
                                   Q_ARG(QString, *takeId))) {
      return failure("Take acceptance controller is unavailable.");
    }
    auto result = started();
    result.insert("clipId", *resolved);
    result.insert("takeId", *takeId);
    return result;
  }
  if (name == "ui_timeline_set_clip_binding") {
    bool generated = false;
    for (const auto &value : clips) {
      if (value.toObject().value("id").toString() == *resolved) {
        generated = value.toObject().value("sourceType") == "generated";
        break;
      }
    }
    if (!generated) {
      return failure("Only generated clips have editable generation bindings.");
    }
    for (const auto *field : {"prompt", "negativePrompt", "provider", "model",
                              "voice", "aspectRatio", "resolution"}) {
      if (args.contains(field) && !args.value(field).isString()) {
        return failure(QString(field) + " must be a string.");
      }
    }
    for (const auto *field :
         {"width", "height", "strength", "numInferenceSteps"}) {
      if (args.contains(field) &&
          (!args.value(field).isDouble() ||
           !std::isfinite(args.value(field).toDouble()))) {
        return failure(QString(field) + " must be finite.");
      }
    }
  }
  if (name == "ui_timeline_set_clip_binding" &&
      args.value("regenerate").toBool()) {
    const auto problem = requireGenerator();
    if (!problem.isEmpty()) {
      return failure(problem);
    }
  }
  auto payload = args;
  payload.insert("clipId", *resolved);
  if (name == "ui_timeline_split_clip" && !payload.contains("atMs")) {
    payload.insert("atMs", m_playheadMs);
  }
  if (payload.contains("trackId")) {
    QStringList trackIds;
    for (const auto &value : raw.value("tracks").toArray()) {
      trackIds.append(value.toObject().value("id").toString());
    }
    const auto trackId =
        nt::aiassist::resolveId(payload.value("trackId").toString(), trackIds);
    if (!trackId) {
      return failure("Track target is missing or ambiguous.");
    }
    payload.insert("trackId", *trackId);
  }
  const auto token = m_timeline->applyEdit("assistant." + name, payload);
  if (name == "ui_timeline_set_clip_binding" &&
      args.value("regenerate").toBool()) {
    if (!QMetaObject::invokeMethod(m_generator, "regenerate",
                                   Qt::DirectConnection,
                                   Q_ARG(QString, *resolved))) {
      return failure("Generation controller does not support regeneration.");
    }
    return started();
  }
  if (!token) {
    return failure("Edit refused or unchanged. Check clip locks and timing.");
  }
  return {{"ok", true}, {"sequenceId", sequenceId}, {"clipId", *resolved}};
}

void AssistantSession::resetHistory() {
  ++m_historyEpoch;
  m_loadingHistory = false;
  m_threads = {};
  m_historyMessageIds.clear();
  m_history.clear();
  m_threadCursor.clear();
  m_messageCursor.clear();
}
QJsonObject AssistantSession::threadListInput(const QString &timelineId,
                                              const QString &cursor) {
  QJsonObject input{
      {"workflow_id", timelineId}, {"limit", 100}, {"reverse", true}};
  if (!cursor.isEmpty()) {
    input.insert("cursor", cursor);
  }
  return input;
}
QJsonObject AssistantSession::messageListInput(const QString &threadId,
                                               const QString &cursor) {
  QJsonObject input{{"thread_id", threadId}, {"limit", 100}, {"reverse", true}};
  if (!cursor.isEmpty()) {
    input.insert("cursor", cursor);
  }
  return input;
}
QString AssistantSession::historyText(const QJsonArray &newestFirst) {
  QString output;
  for (qsizetype i = newestFirst.size(); i > 0; --i) {
    const auto message = newestFirst.at(i - 1).toObject();
    const auto role = message.value("role").toString();
    if (role != "user" && role != "assistant") {
      continue;
    }
    QString text;
    const auto content = message.value("content");
    if (content.isString()) {
      text = content.toString();
    } else {
      for (const auto &value : content.toArray()) {
        const auto part = value.toObject();
        if (part.value("type").toString() == "text") {
          text += part.value("text").toString();
        }
      }
    }
    if (!text.isEmpty()) {
      output += (role == "user" ? "You:\n" : "Assistant:\n") + text + "\n\n";
    }
  }
  return output;
}
void AssistantSession::newConversation() {
  if (m_busy || m_loadingHistory) {
    return;
  }
  ++m_historyEpoch;
  m_threadId.clear();
  m_history.clear();
  m_answer.clear();
  m_messageCursor.clear();
  m_historyMessageIds.clear();
  m_error.clear();
  emit changed();
}
bool AssistantSession::listThreads(bool more) {
  if (!m_timeline || (more && m_threadCursor.isEmpty())) {
    return false;
  }
  return queryHistory(
      "threads.list",
      threadListInput(m_timeline->timeline().raw.value("id").toString(),
                      more ? m_threadCursor : QString{}),
      more);
}
bool AssistantSession::loadThread(const QString &id) {
  if (!m_timeline || m_busy || m_loadingHistory) {
    return false;
  }
  static const QRegularExpression prefix("^[0-9a-f]{12}$");
  if (id.size() == 12 && prefix.match(id).hasMatch()) {
    return queryHistory(
        "threads.resolve",
        {{"workflow_id", m_timeline->timeline().raw.value("id")},
         {"thread_id", id}},
        false);
  }
  QStringList ids;
  for (const auto &value : m_threads) {
    ids.append(value.toObject().value("id").toString());
  }
  const auto resolved = nt::aiassist::resolveId(id, ids);
  if (!resolved) {
    m_error = "Conversation is missing or ambiguous. Refresh previous chats.";
    emit changed();
    return false;
  }
  return queryHistory("messages.list", messageListInput(*resolved), false);
}
bool AssistantSession::loadOlderMessages() {
  if (m_threadId.isEmpty() || m_messageCursor.isEmpty()) {
    return false;
  }
  return queryHistory("messages.list",
                      messageListInput(m_threadId, m_messageCursor), true);
}
bool AssistantSession::queryHistory(const QString &procedure,
                                    const QJsonObject &input, bool append) {
  if (!m_timeline || m_busy || m_loadingHistory) {
    return false;
  }
  auto transport = m_historyCall;
  if (!transport) {
    const auto target = nt::server::serverSaveTarget();
    if (!target) {
      m_error = "Open a server timeline to load conversations.";
      emit changed();
      return false;
    }
    transport = [target](const QString &name, const QJsonObject &data) {
      nt::server::ServerClient server(target->server, target->token);
      return server.query(name, data);
    };
  }
  const auto generation = m_timeline->documentGeneration();
  const auto snapshot = m_timeline->timeline().raw;
  const QPointer<TimelineModel> model = m_timeline;
  const QPointer<AssistantSession> guard(this);
  const auto epoch = ++m_historyEpoch;
  m_loadingHistory = true;
  m_error.clear();
  emit changed();
  auto *worker = QThread::create([guard, model, generation, snapshot, epoch,
                                  transport, procedure, input, append] {
    auto resolvedInput = input;
    auto effectiveProcedure = procedure;
    nt::server::QueryResult response;
    if (procedure == "threads.resolve") {
      QString cursor;
      QSet<QString> cursors;
      QStringList authorized;
      for (;;) {
        const auto page = transport(
            "threads.list",
            threadListInput(input.value("workflow_id").toString(), cursor));
        if (!page.ok()) {
          response = page;
          break;
        }
        for (const auto &value :
             page.data.toObject().value("threads").toArray()) {
          const auto thread = value.toObject();
          if (thread.value("workflow_id") == input.value("workflow_id")) {
            authorized.append(thread.value("id").toString());
          }
        }
        const auto next = page.data.toObject().value("next").toString();
        if (next.isEmpty()) {
          authorized.removeDuplicates();
          const auto resolved = nt::aiassist::resolveId(
              input.value("thread_id").toString(), authorized);
          if (!resolved) {
            response.error.message =
                "Conversation prefix is missing or ambiguous.";
          } else {
            resolvedInput = messageListInput(*resolved);
            effectiveProcedure = "messages.list";
            response = transport(effectiveProcedure, resolvedInput);
          }
          break;
        }
        if (next == cursor || cursors.contains(next)) {
          response.error.message = "Conversation pagination did not advance.";
          break;
        }
        cursors.insert(next);
        cursor = next;
      }
    } else {
      response = transport(procedure, input);
    }
    if (!guard) {
      return;
    }
    QMetaObject::invokeMethod(
        guard,
        [guard, model, generation, snapshot, epoch, response,
         procedure = effectiveProcedure, input = resolvedInput, append] {
          if (!guard || guard->m_historyEpoch != epoch) {
            return;
          }
          guard->m_loadingHistory = false;
          if (!model || guard->m_timeline != model ||
              model->documentGeneration() != generation ||
              model->timeline().raw != snapshot || guard->m_busy) {
            guard->m_error = "The timeline changed. Refresh previous chats.";
          } else if (!response.ok()) {
            guard->m_error = response.describe();
          } else if (procedure == "threads.list") {
            const auto page = response.data.toObject();
            const auto threads = page.value("threads").toArray();
            if (!append) {
              guard->m_threads = {};
            }
            QSet<QString> ids;
            for (const auto &value : guard->m_threads) {
              ids.insert(value.toObject().value("id").toString());
            }
            for (const auto &value : threads) {
              const auto thread = value.toObject();
              if (thread.value("workflow_id") != snapshot.value("id") ||
                  ids.contains(thread.value("id").toString())) {
                continue;
              }
              guard->m_threads.append(thread);
              ids.insert(thread.value("id").toString());
            }
            guard->m_threadCursor = page.value("next").toString();
            if (guard->m_threadCursor == input.value("cursor").toString()) {
              guard->m_threadCursor.clear();
            }
          } else {
            const auto page = response.data.toObject();
            if (!append) {
              guard->m_historyMessageIds.clear();
            }
            QJsonArray messages;
            for (const auto &value : page.value("messages").toArray()) {
              const auto message = value.toObject();
              const auto id = message.value("id").toString();
              if (message.value("thread_id") != input.value("thread_id") ||
                  (!id.isEmpty() && guard->m_historyMessageIds.contains(id))) {
                continue;
              }
              messages.append(message);
              if (!id.isEmpty()) {
                guard->m_historyMessageIds.insert(id);
              }
            }
            const auto text = historyText(messages);
            guard->m_history = append ? text + guard->m_history : text;
            guard->m_threadId = input.value("thread_id").toString();
            guard->m_generation = generation;
            if (!append) {
              guard->m_answer.clear();
            }
            guard->m_messageCursor = page.value("next").toString();
            if (guard->m_messageCursor == input.value("cursor").toString()) {
              guard->m_messageCursor.clear();
            }
          }
          emit guard->changed();
        },
        Qt::QueuedConnection);
  });
  connect(worker, &QThread::finished, worker, &QObject::deleteLater);
  worker->start();
  return true;
}

bool AssistantSession::savePlanning() {
  const QJsonObject checkpoint{{"timelineId", m_planningObserved.value("id")},
                               {"observed", m_planningObserved},
                               {"document", m_preparedDocument},
                               {"requests", m_generationRequests},
                               {"active_request", m_activeGenerationRequest},
                               {"review", m_planningReview}};
  if (m_planningPersist) {
    return m_planningPersist(checkpoint);
  }
  const auto target = nt::server::serverSaveTarget();
  if (!target ||
      target->timelineId != m_planningObserved.value("id").toString() ||
      !target->expectedInstance.isEmpty()) {
    m_error = "Open an identity-compatible server timeline before submitting a "
              "prepared batch.";
    return false;
  }
  if (!QDir().mkpath(target->backupDir)) {
    m_error =
        "Could not create the planning recovery folder. No request was sent.";
    return false;
  }
  const auto key =
      QString::fromLatin1(QCryptographicHash::hash(target->timelineId.toUtf8(),
                                                   QCryptographicHash::Sha256)
                              .toHex());
  QSaveFile file(
      QDir(target->backupDir).filePath("beat-batch-" + key + ".json"));
  if (!file.open(QIODevice::WriteOnly)) {
    m_error = file.errorString();
    return false;
  }
  const auto bytes = QJsonDocument(checkpoint).toJson();
  if (file.write(bytes) != bytes.size() || !file.commit()) {
    m_error = "Could not checkpoint the reviewed batch. No additional request "
              "was sent.";
    return false;
  }
  return true;
}

bool AssistantSession::approvePlanning(bool approve) {
  if (!approve) {
    m_generationQueueActive = false;
    m_planRequestId.clear();
    m_planningTimeout.stop();
    if (!m_activeGenerationRequest.isEmpty() && m_generator) {
      QMetaObject::invokeMethod(m_generator, "cancel", Qt::DirectConnection);
    }
    m_planningReview = {};
    emit changed();
    return true;
  }
  if (!m_timeline || m_timeline->documentGeneration() != m_planningGeneration ||
      m_timeline->timeline().raw != m_planningObserved) {
    m_error = "The timeline changed after this review. Prepare and review the "
              "request again.";
    m_planningReview = {};
    emit changed();
    return false;
  }
  const auto kind = m_planningReview.value("kind").toString();
  if (kind == "directorRequest") {
    if ((!m_ready && !m_planningSend) || !m_planRequestId.isEmpty()) {
      m_error = "Connect the assistant before starting the reviewed Director "
                "request.";
      emit changed();
      return false;
    }
    const auto request = m_planningReview.value("request").toObject();
    m_planRequestId = QUuid::createUuid().toString(QUuid::Id128);
    m_planningReview.insert("kind", "directorRunning");
    m_planningReview.insert("requiresApproval", false);
    const bool sent =
        m_planningSend
            ? m_planningSend("generate_text", request, m_planRequestId)
            : m_socket.sendTextMessage(QString::fromUtf8(
                  QJsonDocument(QJsonObject{{"command", "generate_text"},
                                            {"request_id", m_planRequestId},
                                            {"data", request}})
                      .toJson(QJsonDocument::Compact))) > 0;
    if (!sent) {
      m_planRequestId.clear();
      m_planningReview.insert("kind", "directorRequest");
      m_planningReview.insert("requiresApproval", true);
      m_error = "The reviewed Director request could not be sent.";
      emit changed();
      return false;
    }
    m_planningTimeout.start();
    emit changed();
    return true;
  }
  if (kind == "planCandidate") {
    const auto token =
        m_timeline->applyEdit("assistant.ui_timeline_plan_beats",
                              {{"beats", m_planningReview.value("beats")}});
    if (!token) {
      m_error = "The Director returned no usable beat plan.";
      emit changed();
      return false;
    }
    m_planningReview = {};
    emit changed();
    return true;
  }
  if (kind != "generationBatch") {
    return false;
  }
  if (!m_generator ||
      m_generator->property("timeline").value<TimelineModel *>() !=
          m_timeline ||
      !m_generator->property("ready").toBool() ||
      m_generator->property("busy").toBool() ||
      m_generator->property("resolving").toBool()) {
    m_error = "Connect generation and wait for its current operation before "
              "approving this batch.";
    emit changed();
    return false;
  }
  m_activeGenerationRequest = {};
  if (!savePlanning()) {
    emit changed();
    return false;
  }
  if (m_timeline->timeline().raw != m_preparedDocument &&
      !m_timeline->applyEdit("assistant.commitBeatGeneration",
                             {{"document", m_preparedDocument}})) {
    m_error = "The prepared cut could not be committed.";
    emit changed();
    return false;
  }
  m_preparedDocument = m_timeline->timeline().raw;
  m_planningReview.insert("kind", "generationRunning");
  m_planningReview.insert("requiresApproval", false);
  m_generationQueueActive = true;
  if (!savePlanning()) {
    m_generationQueueActive = false;
    emit changed();
    return false;
  }
  emit changed();
  advanceBeatGeneration();
  return m_generationQueueActive || m_generationRequests.isEmpty();
}

void AssistantSession::advanceBeatGeneration() {
  if (!m_generationQueueActive || m_generationDispatching || !m_generator ||
      !m_timeline) {
    return;
  }
  if (m_timeline->documentGeneration() != m_planningGeneration ||
      m_generator->property("timeline").value<TimelineModel *>() !=
          m_timeline) {
    m_generationQueueActive = false;
    m_error = "The timeline changed. The remaining batch was not submitted.";
    emit changed();
    return;
  }
  if (m_generator->property("busy").toBool() ||
      m_generator->property("resolving").toBool()) {
    return;
  }
  if (!m_activeGenerationRequest.isEmpty()) {
    const auto state = m_generator->property("state").toString();
    if (state != "completed" && state != "failed" && state != "cancelled") {
      return;
    }
    if (state != "completed") {
      auto errors = m_planningReview.value("errors").toArray();
      errors.append(
          QJsonObject{{"clipId", m_activeGenerationRequest.value("clip_id")},
                      {"error", m_generator->property("error").toString()}});
      m_planningReview.insert("errors", errors);
    }
    m_activeGenerationRequest = {};
  }
  if (m_generationRequests.isEmpty()) {
    m_generationQueueActive = false;
    auto document = m_timeline->timeline().raw;
    auto setup = document.value("setup").toObject();
    auto prepared = setup.value("prepared_generation").toObject();
    prepared.insert("status", "submitted");
    setup.insert("prepared_generation", prepared);
    document.insert("setup", setup);
    m_timeline->settleDocument(document);
    m_preparedDocument = document;
    m_planningReview.insert("kind", "generationSubmitted");
    savePlanning();
    emit changed();
    return;
  }
  if (!m_generator->property("ready").toBool()) {
    m_generationQueueActive = false;
    m_error = "Generation disconnected. Recover the reviewed batch before "
              "submitting its remaining requests.";
    savePlanning();
    emit changed();
    return;
  }
  const auto request = m_generationRequests.first().toObject();
  const auto clipId = request.value("clip_id").toString();
  QJsonObject submitted, current;
  for (const auto &value : m_preparedDocument.value("clips").toArray()) {
    if (value.toObject().value("id").toString() == clipId) {
      submitted = value.toObject();
      break;
    }
  }
  for (const auto &value : m_timeline->clipsJson()) {
    if (value.toObject().value("id").toString() == clipId) {
      current = value.toObject();
      break;
    }
  }
  const auto preparedSetup = m_preparedDocument.value("setup").toObject(),
             currentSetup =
                 m_timeline->timeline().raw.value("setup").toObject();
  for (const auto *field :
       {"beats", "generation_settings", "creative_context", "voiceover"}) {
    if (preparedSetup.value(field) != currentSetup.value(field)) {
      m_generationQueueActive = false;
      m_error = "The reviewed production policy changed. Prepare a fresh batch "
                "before spending.";
      savePlanning();
      emit changed();
      return;
    }
  }
  bool matches = !submitted.isEmpty() && !current.isEmpty();
  for (const auto *field :
       {"sourceType", "prompt", "negativePrompt", "provider", "model",
        "bindingKind", "referenceImageIds", "referenceEntityIds", "voice",
        "durationMs", "width", "height", "aspectRatio", "resolution", "seed",
        "strength", "numInferenceSteps", "sourceClipId", "paramOverrides"}) {
    matches = matches && submitted.value(field) == current.value(field);
  }
  if (request.value("production").isObject()) {
    bool found = false;
    for (const auto &value : submitted.value("paramOverrides")
                                 .toObject()
                                 .value("productionCandidates")
                                 .toArray()) {
      const auto candidate = value.toObject();
      if (candidate.value("identity").toObject().value("requestId") ==
          request.value("request_id")) {
        found = candidate == request.value("production").toObject();
        break;
      }
    }
    matches = matches && found;
  } else if (!submitted.value("paramOverrides")
                  .toObject()
                  .value("productionCandidates")
                  .toArray()
                  .isEmpty()) {
    matches = false;
  }
  if (!matches) {
    m_generationQueueActive = false;
    m_error = "A prepared clip's generation recipe changed. Review a new batch "
              "before spending.";
    savePlanning();
    emit changed();
    return;
  }
  m_generationRequests.removeFirst();
  m_activeGenerationRequest = request;
  if (!savePlanning()) {
    m_generationRequests.prepend(request);
    m_activeGenerationRequest = {};
    m_generationQueueActive = false;
    emit changed();
    return;
  }
  m_generationDispatching = true;
  const bool production = request.value("production").isObject();
  const bool invoked =
      production
          ? QMetaObject::invokeMethod(
                m_generator, "regenerateProductionPrepared",
                Qt::DirectConnection, Q_ARG(QString, clipId),
                Q_ARG(QVariantMap,
                      request.value("production").toObject().toVariantMap()))
          : QMetaObject::invokeMethod(
                m_generator, "regeneratePrepared", Qt::DirectConnection,
                Q_ARG(QString, clipId),
                Q_ARG(QString, request.value("request_id").toString()));
  m_generationDispatching = false;
  if (!invoked || (!m_generator->property("busy").toBool() &&
                   !m_generator->property("resolving").toBool())) {
    m_generationQueueActive = false;
    m_error = m_generator->property("error").toString();
    if (m_error.isEmpty()) {
      m_error = "The reviewed request did not start. Recover its original "
                "request instead of sending it twice.";
    }
    savePlanning();
  }
  m_planningReview.insert("remainingRequests", m_generationRequests.size());
  emit changed();
}

bool AssistantSession::recoverPlanning() {
  if (!m_timeline || m_generationQueueActive || !m_planRequestId.isEmpty()) {
    return false;
  }
  const auto target = nt::server::serverSaveTarget();
  if (!target) {
    return false;
  }
  const auto key =
      QString::fromLatin1(QCryptographicHash::hash(target->timelineId.toUtf8(),
                                                   QCryptographicHash::Sha256)
                              .toHex());
  QFile file(QDir(target->backupDir).filePath("beat-batch-" + key + ".json"));
  if (!file.open(QIODevice::ReadOnly)) {
    m_error = "No prepared batch recovery record is available.";
    emit changed();
    return false;
  }
  const auto checkpoint = QJsonDocument::fromJson(file.readAll()).object();
  return restorePlanningCheckpoint(checkpoint);
}

bool AssistantSession::restorePlanningCheckpoint(
    const QJsonObject &checkpoint) {
  if (!m_timeline) {
    return false;
  }
  if (checkpoint.value("timelineId") !=
      m_timeline->timeline().raw.value("id")) {
    return false;
  }
  m_preparedDocument = checkpoint.value("document").toObject();
  m_generationRequests = checkpoint.value("requests").toArray();
  if (m_generationRequests.isEmpty()) {
    m_error = "No unsubmitted requests remain. Review existing generation "
              "candidates.";
    emit changed();
    return false;
  }
  const auto current = m_timeline->timeline().raw;
  QSet<QString> ids;
  for (const auto &value : current.value("clips").toArray()) {
    ids.insert(value.toObject().value("id").toString());
  }
  bool present = true;
  for (const auto &request : m_generationRequests) {
    if (!ids.contains(request.toObject().value("clip_id").toString())) {
      present = false;
      break;
    }
  }
  if (present) {
    const auto reviewedDocument = m_preparedDocument;
    for (const auto &request : m_generationRequests) {
      const auto clipId = request.toObject().value("clip_id").toString();
      QJsonObject reviewedClip, currentClip;
      for (const auto &value : reviewedDocument.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == clipId) {
          reviewedClip = value.toObject();
          break;
        }
      }
      for (const auto &value : current.value("clips").toArray()) {
        if (value.toObject().value("id").toString() == clipId) {
          currentClip = value.toObject();
          break;
        }
      }
      bool unchanged = !reviewedClip.isEmpty() && !currentClip.isEmpty();
      for (const auto *field :
           {"sourceType", "bindingKind", "provider", "model", "prompt",
            "negativePrompt", "voice", "durationMs", "width", "height",
            "aspectRatio", "resolution", "seed", "strength",
            "numInferenceSteps", "referenceImageIds", "referenceEntityIds",
            "sourceClipId", "paramOverrides"}) {
        unchanged =
            unchanged && reviewedClip.value(field) == currentClip.value(field);
      }
      if (request.toObject().value("production").isObject()) {
        bool found = false;
        for (const auto &value : reviewedClip.value("paramOverrides")
                                     .toObject()
                                     .value("productionCandidates")
                                     .toArray()) {
          const auto candidate = value.toObject();
          if (candidate.value("identity").toObject().value("requestId") ==
              request.toObject().value("request_id")) {
            found =
                candidate == request.toObject().value("production").toObject();
            break;
          }
        }
        unchanged = unchanged && found;
      } else if (!reviewedClip.value("paramOverrides")
                      .toObject()
                      .value("productionCandidates")
                      .toArray()
                      .isEmpty()) {
        unchanged = false;
      }
      if (!unchanged) {
        m_error = "A pending generation recipe changed since the saved review. "
                  "Prepare a fresh batch before approving it.";
        m_planningReview = {};
        emit changed();
        return false;
      }
    }
    const auto reviewedSetup = reviewedDocument.value("setup").toObject(),
               currentSetup = current.value("setup").toObject();
    for (const auto *field :
         {"beats", "generation_settings", "creative_context", "voiceover"}) {
      if (reviewedSetup.value(field) != currentSetup.value(field)) {
        m_error =
            "The saved production context changed. Prepare a fresh batch.";
        m_planningReview = {};
        emit changed();
        return false;
      }
    }
    for (const auto *field : {"width", "height"}) {
      if (reviewedDocument.value(field) != current.value(field)) {
        m_error = "The reviewed canvas changed. Prepare a fresh batch.";
        m_planningReview = {};
        emit changed();
        return false;
      }
    }
    m_preparedDocument = current;
  } else if (current != checkpoint.value("observed").toObject()) {
    m_error = "The cut changed since this batch was prepared. Re-plan before "
              "restoring placeholders.";
    emit changed();
    return false;
  }
  m_planningObserved = current;
  m_planningGeneration = m_timeline->documentGeneration();
  m_activeGenerationRequest = {};
  m_planningReview = checkpoint.value("review").toObject();
  m_planningReview.insert("kind", "generationBatch");
  m_planningReview.insert("requiresApproval", true);
  m_planningReview.insert("requests", m_generationRequests);
  m_planningReview.insert("requestCount", m_generationRequests.size());
  emit changed();
  return true;
}
