#include "EditorController.h"
#include "core/PlayerInput.h"
#include "scripts/ScriptHost.h"
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
#include <QQuaternion>
#include <QSaveFile>
#include <QUuid>
#include <QVector3D>
#include <algorithm>
#include <chrono>
#include <cmath>
namespace nodetool::game {
namespace {
QVariant variant(const Json &value) {
  return QJsonDocument::fromJson(QByteArray::fromStdString(value.dump()))
      .toVariant();
}
Json findEntity(const Json &doc, const QString &id) {
  for (const auto &s : doc.at("scenes")) {
    for (const auto &e : s.at("entities")) {
      if (e.at("id") == id.toStdString()) {
        return e;
      }
    }
  }
  throw Error("validation_error", "Select an entity first");
}
std::string sceneFor(const Json &doc, const QString &id) {
  for (const auto &s : doc.at("scenes")) {
    for (const auto &e : s.at("entities")) {
      if (e.at("id") == id.toStdString()) {
        return s.at("id");
      }
    }
  }
  throw Error("validation_error", "Entity not found");
}
void compile(const Json &doc) {
  ScriptHost host;
  for (const auto &s : doc.at("scripts")) {
    host.validateSource(s.at("source"), s.at("id"));
  }
}
} // namespace
EditorController::EditorController(QObject *parent) : QObject(parent) {
  assetTimer_.setInterval(20);
  connect(&assetTimer_, &QTimer::timeout, this, [this] {
    if (!assetLoad_.valid() || assetLoad_.wait_for(std::chrono::seconds(0)) !=
                                   std::future_status::ready) {
      return;
    }
    auto loaded = assetLoad_.get();
    if (loaded.key != assetKey_) {
      launchAssets();
      return;
    }
    models_ = std::move(loaded.models);
    images_ = std::move(loaded.images);
    try {
      if (document().at("assets").empty()) {
        fonts_ = std::make_shared<RenderFonts>();
      } else {
        PreparedAssets prepared(QFileInfo(path_).absolutePath().toStdString(),
                                document().at("assets"));
        fonts_ = prepareHudFonts3D(prepared, document().at("assets"));
      }
    } catch (const std::exception &error) {
      loaded.error = QString::fromUtf8(error.what());
    }
    if (!loaded.error.isEmpty()) {
      diagnostic_ = loaded.error;
    }
    if (viewport_) {
      viewport_->setModels(models_);
      viewport_->setImages(images_);
      viewport_->setFonts(fonts_);
    }
    emit changed();
  });
  assetTimer_.start();
  timer_.setInterval(16);
  connect(&timer_, &QTimer::timeout, this, [this] {
    if (viewport_) {
      viewport_->update();
    }
  });
  connect(&server_, &QLocalServer::newConnection, this, [this] {
    while (server_.hasPendingConnections()) {
      auto *socket = server_.nextPendingConnection();
      if (connections_ >= 16) {
        socket->disconnectFromServer();
        socket->deleteLater();
        continue;
      }
      ++connections_;
      connect(socket, &QLocalSocket::disconnected, this,
              [this] { --connections_; });
      socket->setReadBufferSize(4 * 1024 * 1024 + 1);
      auto buffer = std::make_shared<QByteArray>();
      connect(socket, &QLocalSocket::readyRead, socket, [this, socket, buffer] {
        buffer->append(socket->readAll());
        if (buffer->size() > 4 * 1024 * 1024) {
          socket->disconnectFromServer();
          return;
        }
        while (buffer->contains('\n')) {
          const auto end = buffer->indexOf('\n');
          const auto line = buffer->left(end);
          buffer->remove(0, end + 1);
          Json response;
          Json request;
          try {
            request = Json::parse(line.toStdString());
            if (request.value("protocolVersion", 1) != 1) {
              throw Error("protocol_error",
                          "Unsupported editor protocol version");
            }
            const auto id = request.at("requestId").get<std::string>();
            if (id.empty() || id.size() > 128) {
              throw Error("validation_error", "Request ID required");
            }
            if (requests_.contains(id)) {
              const auto &cached = requests_.at(id);
              if (cached.first != request) {
                throw Error("conflict",
                            "Request ID reused with different payload");
              }
              socket->write(QByteArray::fromStdString(cached.second.dump()) +
                            '\n');
              continue;
            }
            response = {
                {"requestId", request.value("requestId", std::string{})},
                {"status", "ok"},
                {"result", dispatch(request)}};
          } catch (const Error &e) {
            response = {
                {"requestId", request.value("requestId", std::string{})},
                {"status", "error"},
                {"error",
                 {{"code", e.code},
                  {"message", e.what()},
                  {"currentRevision", revision()}}}};
          } catch (const std::exception &e) {
            response = {
                {"status", "error"},
                {"error",
                 {{"code", "validation_error"}, {"message", e.what()}}}};
          }
          const auto bytes = QByteArray::fromStdString(response.dump()) + '\n';
          if (request.is_object() && request.contains("requestId") &&
              request["requestId"].is_string()) {
            const auto id = request["requestId"].get<std::string>();
            const auto size = request.dump().size() + response.dump().size();
            while (!requestOrder_.empty() &&
                   (requests_.size() >= 64 ||
                    requestBytes_ + size > 16 * 1024 * 1024)) {
              const auto old = requestOrder_.front();
              requestOrder_.pop_front();
              requestBytes_ -= requests_[old].first.dump().size() +
                               requests_[old].second.dump().size();
              requests_.erase(old);
            }
            if (size <= 16 * 1024 * 1024 && !requests_.contains(id)) {
              requests_[id] = {request, response};
              requestOrder_.push_back(id);
              requestBytes_ += size;
            }
          }
          if (socket->bytesToWrite() + bytes.size() > 8 * 1024 * 1024) {
            socket->disconnectFromServer();
            return;
          }
          socket->write(bytes);
        }
      });
      connect(socket, &QLocalSocket::disconnected, socket,
              &QObject::deleteLater);
    }
  });
}
EditorController::~EditorController() {
  halt();
  if (assetCancel_) {
    assetCancel_->store(true);
  }
  if (assetLoad_.valid()) {
    assetLoad_.wait();
  }
}
void EditorController::halt() {
  if (playback_.joinable()) {
    playback_.request_stop();
    playback_.join();
  }
  advancing_ = false;
  timer_.stop();
  if (!playbackError_.empty()) {
    diagnostic_ = QString::fromStdString(playbackError_);
  }
}
void EditorController::resume() {
  if (!session_) {
    return;
  }
  halt();
  advancing_ = true;
  playbackError_.clear();
  timer_.start();
  const auto dimension = document().at("dimension").get<std::string>();
  playback_ = std::jthread([this, dimension](std::stop_token stop) {
    auto next = std::chrono::steady_clock::now();
    while (!stop.stop_requested()) {
      try {
        Json input;
        {
          std::scoped_lock lock(inputMutex_);
          input = actions_;
        }
        const auto frame =
            jsonSaves_.step(*session_, movementInput(input, dimension));
        mailbox_->publish(frame);
      } catch (const std::exception &e) {
        playbackError_ = e.what();
        const auto error = QString::fromUtf8(e.what());
        QMetaObject::invokeMethod(
            this,
            [this, error] {
              diagnostic_ = error;
              timer_.stop();
              emit changed();
            },
            Qt::QueuedConnection);
        break;
      }
      next += std::chrono::microseconds(16667);
      std::this_thread::sleep_until(next);
    }
    advancing_ = false;
  });
}
Json EditorController::document() const {
  if (!document_) {
    throw Error("unavailable", "Open a game first");
  }
  return document_->inspect();
}
qulonglong EditorController::revision() const {
  return document_ ? document_->inspect().at("revision").get<std::uint64_t>()
                   : 0;
}
QVariantList EditorController::entities() const {
  QVariantList rows;
  if (document_) {
    const auto &doc = document_->inspect();
    for (const auto &s : doc.at("scenes")) {
      for (const auto &entity : s.at("entities")) {
        auto e = entity;
        e["sceneId"] = s.at("id");
        rows.push_back(variant(e));
      }
    }
  }
  return rows;
}
QVariantList EditorController::assets() const {
  return document_ ? variant(document_->inspect().at("assets")).toList()
                   : QVariantList{};
}
QVariantList EditorController::scripts() const {
  return document_ ? variant(document_->inspect().at("scripts")).toList()
                   : QVariantList{};
}
QVariantMap EditorController::selection() const {
  try {
    return variant(findEntity(document(), selected_)).toMap();
  } catch (...) {
    return {};
  }
}
QString EditorController::saveState() const {
  return dirty_ ? QStringLiteral("Unsaved draft") : QStringLiteral("Saved");
}
void EditorController::openDocument(Json doc, QString path) {
  auto candidate = std::make_unique<Document>(std::move(doc));
  compile(candidate->inspect());
  stop();
  document_ = std::move(candidate);
  path_ = std::move(path);
  selected_.clear();
  dirty_ = false;
  savedBase_ = document_->inspect();
  localRevision_.reset();
  diagnostic_.clear();
  drag_.reset();
  camera_ = Json::object();
  publish();
}
Json EditorController::read(const QString &path) {
  QFile file(path);
  if (!file.open(QIODevice::ReadOnly) || file.size() > 4 * 1024 * 1024) {
    throw Error("file_error", "Cannot read bounded game document");
  }
  return Json::parse(file.readAll().toStdString());
}
void EditorController::write(const QString &path, const Json &value) {
  QSaveFile file(path);
  if (!file.open(QIODevice::WriteOnly)) {
    throw Error("file_error", "Cannot write game document");
  }
  const auto bytes = QByteArray::fromStdString(value.dump(2));
  if (file.write(bytes) != bytes.size() || !file.commit()) {
    throw Error("file_error", "Atomic document save failed");
  }
}
bool EditorController::open(const QString &path, bool recover) {
  try {
    auto authored = read(path);
    const auto durable = authored;
    const auto draftPath = path + ".draft.json";
    bool recovered = false;
    if (recover && QFile::exists(draftPath)) {
      auto pending = read(draftPath);
      if (pending.at("id") == authored.at("id") &&
          pending.at("revision") >= authored.at("revision")) {
        authored = std::move(pending);
        recovered = true;
      }
    }
    openDocument(std::move(authored), QFileInfo(path).absoluteFilePath());
    dirty_ = recovered;
    savedBase_ = durable;
    emit changed();
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
bool EditorController::save(const QString &requested) {
  try {
    auto target =
        requested.isEmpty() ? path_ : QFileInfo(requested).absoluteFilePath();
    if (target.isEmpty()) {
      throw Error("file_error", "Choose a save path");
    }
    if (target == path_ && QFile::exists(target) &&
        read(target) != savedBase_) {
      throw Error("conflict",
                  "Saved document changed externally. Reopen before saving.");
    }
    write(target, document());
    savedBase_ = document();
    path_ = target;
    dirty_ = false;
    QFile::remove(path_ + ".draft.json");
    diagnostic_.clear();
    emit changed();
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
void EditorController::draft() {
  if (!path_.isEmpty()) {
    try {
      write(path_ + ".draft.json", document());
    } catch (const std::exception &e) {
      diagnostic_ =
          QStringLiteral(
              "Edit accepted, but draft recovery could not be written: ") +
          QString::fromUtf8(e.what());
    }
  }
}
bool EditorController::discardDraft() {
  if (path_.isEmpty()) {
    return false;
  }
  QFile::remove(path_ + ".draft.json");
  return open(path_, false);
}
void EditorController::select(const QString &id) {
  selected_ = id;
  emit changed();
}
QString EditorController::selectedJson() const {
  try {
    return QString::fromStdString(findEntity(document(), selected_).dump(2));
  } catch (...) {
    return {};
  }
}
QString EditorController::source(const QString &id) const {
  if (document_) {
    for (const auto &s : document_->inspect().at("scripts")) {
      if (s.at("id") == id.toStdString()) {
        return QString::fromStdString(s.at("source").get<std::string>());
      }
    }
  }
  return {};
}
QString EditorController::classify(const QString &text) const {
  try {
    const auto ops = Json::parse(text.toStdString());
    for (const auto &op : ops) {
      if (op.at("kind") != "setTitle") {
        return "restart";
      }
    }
    return "presentation";
  } catch (...) {
    return "restart";
  }
}
void EditorController::commit(const Json &operations, std::uint64_t expected) {
  const bool running = advancing_;
  halt();
  try {
    if (!document_) {
      throw Error("unavailable", "Open a game first");
    }
    auto candidate = Document(document());
    candidate.transact({{"requestId", "prepare"},
                        {"expectedRevision", expected},
                        {"operations", operations}});
    compile(candidate.inspect());
    const auto effect = classify(QString::fromStdString(operations.dump()));
    std::unique_ptr<Session> prepared;
    if (session_ && effect == "restart") {
      prepared = std::make_unique<Session>(candidate.inspect());
    }
    document_->transact(
        {{"requestId",
          QUuid::createUuid().toString(QUuid::Id128).toStdString()},
         {"expectedRevision", expected},
         {"operations", operations}});
    if (prepared) {
      session_ = std::move(prepared);
      jsonSaves_ = JsonSaveHost{};
    }
    if (!externalEdit_) {
      localRevision_ = revision();
    }
    dirty_ = true;
    editEffect_ = effect;
    diagnostic_.clear();
    draft();
    publish();
    if (running) {
      resume();
    }
  } catch (...) {
    if (running) {
      resume();
    }
    throw;
  }
}
bool EditorController::transact(const QString &text, qulonglong expected) {
  try {
    commit(Json::parse(text.toStdString()), expected);
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
bool EditorController::editEntity(const QString &text) {
  try {
    auto entity = Json::parse(text.toStdString());
    if (entity.at("id") != selected_.toStdString()) {
      throw Error("validation_error",
                  "Entity identity cannot change in the inspector");
    }
    commit(Json::array({{{"kind", "updateEntity"},
                         {"sceneId", sceneFor(document(), selected_)},
                         {"entity", entity}}}),
           revision());
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
bool EditorController::editScript(const QString &id,
                                  const QString &sourceText) {
  try {
    auto s =
        Json{{"id", id.toStdString()}, {"source", sourceText.toStdString()}};
    const auto doc = document();
    for (const auto &old : doc.at("scripts")) {
      if (old.at("id") == id.toStdString()) {
        s = old;
        s["source"] = sourceText.toStdString();
        break;
      }
    }
    commit(Json::array({{{"kind", "setScript"}, {"script", s}}}), revision());
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
bool EditorController::undo() {
  const bool running = advancing_;
  halt();
  try {
    if (!externalEdit_ && (!localRevision_ || *localRevision_ != revision())) {
      throw Error("conflict", "An agent edited after your last command. Review "
                              "the current document before undoing.");
    }
    auto backup = document();
    document_->undo(revision());
    try {
      compile(document_->inspect());
      if (session_) {
        session_ = std::make_unique<Session>(document());
        jsonSaves_ = JsonSaveHost{};
      }
    } catch (...) {
      document_ = std::make_unique<Document>(backup);
      throw;
    }
    dirty_ = true;
    if (!externalEdit_) {
      localRevision_ = revision();
    }
    draft();
    publish();
    if (running) {
      resume();
    }
    return true;
  } catch (const std::exception &e) {
    if (running) {
      resume();
    }
    return fail(e);
  }
}
bool EditorController::redo() {
  const bool running = advancing_;
  halt();
  try {
    if (!externalEdit_ && (!localRevision_ || *localRevision_ != revision())) {
      throw Error("conflict", "An agent edited after your last command. Review "
                              "the current document before redoing.");
    }
    auto backup = document();
    document_->redo(revision());
    try {
      compile(document_->inspect());
      if (session_) {
        session_ = std::make_unique<Session>(document());
        jsonSaves_ = JsonSaveHost{};
      }
    } catch (...) {
      document_ = std::make_unique<Document>(backup);
      throw;
    }
    dirty_ = true;
    if (!externalEdit_) {
      localRevision_ = revision();
    }
    draft();
    publish();
    if (running) {
      resume();
    }
    return true;
  } catch (const std::exception &e) {
    if (running) {
      resume();
    }
    return fail(e);
  }
}
bool EditorController::beginDrag(const QString &mode) {
  try {
    if (mode != "translate" && mode != "rotate" && mode != "scale") {
      throw Error("validation_error", "Unknown transform tool");
    }
    auto entity = findEntity(document(), selected_);
    drag_ = Drag{revision(), mode, entity, entity};
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
void EditorController::previewDrag(double x, double y, double z, double snap) {
  if (!drag_) {
    return;
  }
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z) ||
      !std::isfinite(snap) || snap < 0) {
    diagnostic_ = "Invalid transform gesture";
    return;
  }
  auto &d = *drag_;
  d.preview = d.entity;
  double values[] = {x, y, z};
  for (auto &v : values) {
    if (snap > 0) {
      v = std::round(v / snap) * snap;
    }
  }
  if (is2D()) {
    auto &t = d.preview["transform"];
    const auto &original = d.entity["transform"];
    if (d.mode == "rotate") {
      t["rotation"] = original.value("rotation", 0.0) + values[0];
    } else if (d.mode == "scale") {
      t["scaleX"] = original.value("scaleX", 1.0) + values[0];
      t["scaleY"] = original.value("scaleY", 1.0) + values[1];
    } else {
      t["x"] = original.value("x", 0.0) + values[0];
      t["y"] = original.value("y", 0.0) + values[1];
    }
  } else if (d.mode == "rotate") {
    const auto &r = d.entity["transform"]["rotation"];
    const auto q = QQuaternion::fromEulerAngles(
                       float(values[0]), float(values[1]), float(values[2])) *
                   QQuaternion(r[3].get<float>(), r[0].get<float>(),
                               r[1].get<float>(), r[2].get<float>());
    d.preview["transform"]["rotation"] = {q.x(), q.y(), q.z(), q.scalar()};
  } else {
    const char *field = d.mode == "scale" ? "scale" : "position";
    for (int i = 0; i < 3; ++i) {
      d.preview["transform"][field][i] =
          d.entity["transform"][field][i].get<double>() + values[i];
    }
  }
  auto frame =
      Json{{"tick", 0},
           {"entities",
            resolvePrefabs(document(), document().at("initialSceneId"))}};
  for (auto &e : frame["entities"]) {
    if (e.at("id") == selected_.toStdString()) {
      e = d.preview;
    }
  }
  mailbox_->publish(frame);
  if (viewport_) {
    viewport_->update();
  }
}
bool EditorController::endDrag() {
  if (!drag_) {
    return false;
  }
  const auto drag = *drag_;
  drag_.reset();
  try {
    commit(Json::array({{{"kind", "updateEntity"},
                         {"sceneId", sceneFor(document(), selected_)},
                         {"entity", drag.preview}}}),
           drag.revision);
    return true;
  } catch (const std::exception &e) {
    publish();
    return fail(e);
  }
}
void EditorController::cancelDrag() {
  drag_.reset();
  publish();
}
bool EditorController::start() {
  try {
    halt();
    session_ = std::make_unique<Session>(document());
    jsonSaves_ = JsonSaveHost{};
    diagnostic_ =
        "Play saves use temporary memory and are cleared when play restarts.";
    publish();
    resume();
    return true;
  } catch (const std::exception &e) {
    return fail(e);
  }
}
void EditorController::stop() {
  halt();
  session_.reset();
  {
    std::scoped_lock lock(inputMutex_);
    actions_ = Json::object();
  }
  publish();
}
bool EditorController::step() {
  halt();
  try {
    if (!session_) {
      throw Error("unavailable", "Start play first");
    }
    if (!playbackError_.empty()) {
      throw Error("script_error", playbackError_);
    }
    jsonSaves_.step(*session_,
                    movementInput(actions_, document().at("dimension")));
    publish();
    return true;
  } catch (const std::exception &e) {
    timer_.stop();
    return fail(e);
  }
}
bool EditorController::applySimulation() {
  halt();
  try {
    if (!session_) {
      throw Error("unavailable", "Start play first");
    }
    auto entity = findEntity(document(), selected_);
    const auto frame = session_->frame();
    for (const auto &runtime : frame.at("entities")) {
      if (runtime.at("id") == selected_.toStdString()) {
        entity["transform"] = runtime.at("transform");
        commit(Json::array({{{"kind", "updateEntity"},
                             {"sceneId", sceneFor(document(), selected_)},
                             {"entity", entity}}}),
               revision());
        return true;
      }
    }
    throw Error("validation_error",
                "Selected entity is not in the running scene");
  } catch (const std::exception &e) {
    return fail(e);
  }
}
void EditorController::navigateCamera(double x, double y, double z) {
  if (!document_) {
    return;
  }
  if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z)) {
    return;
  }
  if (is2D()) {
    if (camera_.empty()) {
      camera_ = document().value(
          "camera2d",
          Json{{"width", 16}, {"height", 9}, {"zoom", 1}, {"x", 0}, {"y", 0}});
    }
    camera_["x"] = camera_.value("x", 0.0) + x;
    camera_["y"] = camera_.value("y", 0.0) + y;
    camera_["zoom"] =
        std::clamp(camera_.value("zoom", 1.0) * std::exp(z), 0.01, 100.0);
    publish();
    return;
  }
  if (camera_.empty()) {
    camera_ = document().value(
        "camera",
        Json{{"position", {0, 4, 8}}, {"target", {0, 0, 0}}, {"fov", 60}});
  }
  for (int i = 0; i < 3; ++i) {
    const auto v = i == 0 ? x : i == 1 ? y : z;
    camera_["position"][i] = camera_["position"][i].get<double>() + v;
    camera_["target"][i] = camera_["target"][i].get<double>() + v;
  }
  publish();
}
void EditorController::setAction(const QString &action, bool active) {
  std::scoped_lock lock(inputMutex_);
  actions_[action.toStdString()] = active;
}
void EditorController::attachViewport(GameViewport *viewport) {
  viewport_ = viewport;
  viewport_->setMailbox(mailbox_);
  viewport_->setModels(models_);
  viewport_->setImages(images_);
  viewport_->setFonts(fonts_);
  publish();
}
void EditorController::prepareAssets() {
  if (!document_) {
    return;
  }
  const auto key =
      path_.toStdString() + document_->inspect().at("assets").dump();
  if (key == assetKey_) {
    return;
  }
  assetKey_ = key;
  images_.reset();
  fonts_.reset();
  if (viewport_) {
    viewport_->setImages(images_);
    viewport_->setFonts(fonts_);
  }
  if (assetCancel_) {
    assetCancel_->store(true);
  }
  if (!assetLoad_.valid()) {
    launchAssets();
  }
}
void EditorController::launchAssets() {
  const auto doc = document();
  const auto path = path_;
  const auto key = assetKey_;
  assetCancel_ = std::make_shared<std::atomic<bool>>(false);
  auto cancelled = assetCancel_;
  assetLoad_ = std::async(std::launch::async, [doc, path, key, cancelled] {
    auto models = std::make_shared<RenderModels>();
    auto images = std::make_shared<RenderImages>();
    QString error;
    try {
      if (!doc.at("assets").empty()) {
        if (path.isEmpty()) {
          throw Error("asset_error",
                      "Save the document before loading workspace assets");
        }
        PreparedAssets prepared(QFileInfo(path).absolutePath().toStdString(),
                                doc.at("assets"));
        *images = prepareImages(prepared, doc.at("assets"));
        for (const auto &asset : doc.at("assets")) {
          if (asset.at("kind") == "model") {
            (*models)[asset.at("id").get<std::string>()] = prepared.model(
                asset.at("id"), [cancelled] { return cancelled->load(); });
          }
        }
      }
    } catch (const std::exception &e) {
      error = QString::fromUtf8(e.what());
    }
    return AssetResult{key, models, images, error};
  });
}
void EditorController::publish() {
  prepareAssets();
  if (document_) {
    auto doc = document();
    Json frame =
        session_
            ? (advancing_ && mailbox_->latest() ? *mailbox_->latest()
                                                : session_->frame())
            : Json{{"tick", 0},
                   {"entities", resolvePrefabs(doc, doc.at("initialSceneId"))},
                   {"score", 0},
                   {"health", 100}};
    if (!camera_.empty()) {
      frame["camera"] = camera_;
      if (!is2D()) {
        doc["camera"] = camera_;
      }
    }
    mailbox_->publish(frame);
    if (viewport_) {
      viewport_->setDocument(doc);
      viewport_->update();
    }
  }
  emit changed();
}
bool EditorController::fail(const std::exception &e) {
  diagnostic_ = QString::fromUtf8(e.what());
  if (const auto *error = dynamic_cast<const Error *>(&e);
      error && !error->details.empty()) {
    diagnostic_ +=
        QStringLiteral("\n") + QString::fromStdString(error->details.dump(2));
  }
  emit changed();
  return false;
}
bool EditorController::listen(const QString &name) {
  server_.setSocketOptions(QLocalServer::UserAccessOption);
  return server_.listen(name);
}
Json EditorController::dispatch(const Json &request) {
  struct External {
    bool &value;
    External(bool &v) : value(v) { value = true; }
    ~External() { value = false; }
  } external(externalEdit_);
  if (request.contains("documentId") &&
      request.at("documentId") != document().at("id")) {
    throw Error("conflict", "Editor document identity changed");
  }
  const auto op = request.at("operation").get<std::string>();
  if (op == "inspect") {
    return {{"document", document()},
            {"revision", revision()},
            {"playing", playing()},
            {"dirty", dirty_},
            {"jsonSaveStorage", jsonSaves_.report()},
            {"diagnostic", diagnostic_.toStdString()}};
  }
  if (op == "transaction") {
    commit(request.at("operations"), request.at("expectedRevision"));
  } else if (op == "undo" || op == "redo") {
    if (request.at("expectedRevision") != revision()) {
      throw Error("conflict", "Document revision changed");
    }
    if (!(op == "undo" ? undo() : redo())) {
      throw Error("edit_error", diagnostic_.toStdString());
    }
  } else if (op == "save") {
    if (!save()) {
      throw Error("file_error", diagnostic_.toStdString());
    }
  } else if (op == "start") {
    if (!start()) {
      throw Error("script_error", diagnostic_.toStdString());
    }
  } else if (op == "stop") {
    stop();
  } else if (op == "step") {
    if (!step()) {
      throw Error("script_error", diagnostic_.toStdString());
    }
  } else if (op == "select") {
    select(QString::fromStdString(request.at("entityId")));
  } else {
    throw Error("unavailable", "Unsupported editor operation");
  }
  return {{"document", document()},
          {"revision", revision()},
          {"playing", playing()}};
}
} // namespace nodetool::game
