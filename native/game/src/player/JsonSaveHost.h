#pragma once
#include "core/JsonSave.h"
#include "core/Session.h"
#include <QDir>
#include <QCryptographicHash>
#include <QFile>
#include <QFileInfo>
#include <QLockFile>
#include <QSaveFile>
#include <QStandardPaths>
#include <deque>
#include <map>
#include <condition_variable>
#include <mutex>
#include <thread>
namespace nodetool::game {
class JsonSaveStore {
public:
  explicit JsonSaveStore(std::string gameId = {}, bool durable = false, QString storageRoot = {}) : durable_(durable) {
    if (durable_) {
      const auto base = storageRoot.isEmpty() ? QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) : storageRoot;
      if (!base.isEmpty()) {
        const auto name = QCryptographicHash::hash(QByteArray::fromStdString(Json::array({gameId, "native-cpp-1"}).dump()), QCryptographicHash::Sha256).toHex();
        root_ = base + "/json-saves/" + QString::fromLatin1(name);
      }
    }
  }
  Json perform(const Json &request) {
    const auto scope = request.at("scope").get<std::string>(), slot = request.at("slot").get<std::string>();
    if (request.at("kind") == "save") { write(scope, slot, {{"formatVersion", 1}, {"data", request.at("data")}}); return nullptr; }
    return read(scope, slot);
  }
private:
  bool durable_;
  QString root_;
  std::map<std::string, Json> memory_;
  QString directory(const std::string &scope) const {
    if (root_.isEmpty()) { throw Error("storage_error", "JSON save storage location is unavailable"); }
    return root_ + "/" + QString::fromStdString(scope);
  }
  Json read(const std::string &scope, const std::string &slot) {
    Json record;
    if (!durable_) {
      const auto found = memory_.find(scope + "/" + slot);
      if (found == memory_.end()) { return nullptr; }
      record = found->second;
    } else {
      QFile file(directory(scope) + "/" + QString::fromStdString(slot) + ".json");
      if (!file.exists()) { return nullptr; }
      if (QFileInfo(file).isSymLink() || !QFileInfo(file).isFile()) { throw Error("storage_error", "JSON saves require regular files"); }
      if (!file.open(QIODevice::ReadOnly) || file.size() > 17 * 1024) { throw Error("storage_error", "Cannot read bounded JSON save"); }
      const auto bytes = file.read(17 * 1024 + 1);
      if (bytes.size() > 17 * 1024) { throw Error("storage_error", "JSON save exceeds byte limit"); }
      record = Json::parse(bytes.toStdString());
    }
    if (!record.is_object() || record.size() != 2 || record.value("formatVersion", 0) != 1 || !record.contains("data")) { throw Error("storage_error", "Invalid JSON save record"); }
    validateSaveData(record.at("data"));
    return record.at("data");
  }
  void write(const std::string &scope, const std::string &slot, const Json &record) {
    if (!durable_) {
      const auto key = scope + "/" + slot;
      std::size_t count = 0;
      for (const auto &[name, value] : memory_) { (void)value; if (name.starts_with(scope + "/")) { ++count; } }
      if (!memory_.contains(key) && count >= 16) { throw Error("storage_error", "JSON save slot limit reached"); }
      memory_[key] = record;
      return;
    }
    const auto path = directory(scope);
    if (!QDir().mkpath(path)) { throw Error("storage_error", "Cannot create JSON save directory"); }
    QLockFile lock(path + "/.write.lock");
    if (!lock.tryLock(0)) { throw Error("storage_error", "JSON save storage is busy"); }
    const auto target = path + "/" + QString::fromStdString(slot) + ".json";
    if (!QFile::exists(target) && QDir(path).entryList({"*.json"}, QDir::Files).size() >= 16) { throw Error("storage_error", "JSON save slot limit reached"); }
    if (QFileInfo(target).isSymLink()) { throw Error("storage_error", "JSON save symlinks are not supported"); }
    QSaveFile file(target);
    const auto bytes = QByteArray::fromStdString(record.dump());
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) { throw Error("storage_error", "Cannot atomically write JSON save"); }
  }
};
/** A serialized bounded IO worker. Completions retain their originating live epoch. */
class JsonSaveWorker {
public:
  explicit JsonSaveWorker(JsonSaveStore store) : store_(std::move(store)), thread_([this](std::stop_token stop) { run(stop); }) {}
  void reset(std::uint64_t generation) {
    std::scoped_lock lock(mutex_);
    ++epoch_; generation_ = generation; completed_.clear();
  }
  void submit(const Json &request) {
    std::scoped_lock lock(mutex_);
    if (queue_.size() + active_ + completed_.size() >= 8) { diagnostic("JSON save queue is full"); return; }
    queue_.push_back({epoch_, request});
    wake_.notify_all();
  }
  Json takeLoaded(std::uint64_t generation) {
    std::scoped_lock lock(mutex_);
    auto result = Json::array();
    if (generation != generation_) { return result; }
    while (!completed_.empty() && result.size() < 2) { const auto &value = completed_.front(); result.push_back({{"scope", value.at("scope")}, {"slot", value.at("slot")}, {"data", value.at("data")}}); completed_.pop_front(); }
    return result;
  }
  void drain() {
    std::unique_lock lock(mutex_);
    wake_.wait(lock, [this] { return queue_.empty() && active_ == 0; });
  }
  Json diagnostics() const { std::scoped_lock lock(mutex_); return diagnostics_; }
private:
  struct Pending { std::uint64_t epoch; Json request; };
  JsonSaveStore store_;
  mutable std::mutex mutex_;
  std::condition_variable_any wake_;
  std::deque<Pending> queue_;
  std::deque<Json> completed_;
  std::uint64_t generation_ = 0, epoch_ = 0;
  std::size_t active_ = 0;
  Json diagnostics_ = Json::array();
  std::jthread thread_;
  void diagnostic(const std::string &message) { if (diagnostics_.size() < 256) { diagnostics_.push_back(message.substr(0, 4096)); } }
  void run(std::stop_token stop) {
    while (!stop.stop_requested()) {
      std::unique_lock lock(mutex_);
      if (!wake_.wait(lock, stop, [this] { return !queue_.empty(); })) { return; }
      auto pending = std::move(queue_.front()); queue_.pop_front();
      if (pending.epoch != epoch_) { wake_.notify_all(); continue; }
      ++active_;
      lock.unlock();
      Json data = nullptr;
      std::string error;
      try {
        data = store_.perform(pending.request);
        if (pending.request.at("kind") == "load" && data.is_null()) { error = "JSON save slot is empty"; }
      } catch (const std::exception &failure) { error = failure.what(); }
      lock.lock();
      --active_;
      if (!error.empty()) { diagnostic(error); }
      if (pending.epoch == epoch_ && pending.request.at("kind") == "load") {
        auto completion = pending.request; completion["data"] = data; completed_.push_back(std::move(completion));
      }
      wake_.notify_all();
    }
  }
};
/** Post-commit JSON storage. Editor memory is ephemeral. Durable IO never runs in simulation. */
class JsonSaveHost {
public:
  explicit JsonSaveHost(std::string gameId = {}, bool durable = false, bool replay = false, QString storageRoot = {})
      : durable_(durable), replay_(replay) {
    if (durable_ && !replay_) { worker_ = std::make_unique<JsonSaveWorker>(JsonSaveStore(std::move(gameId), true, std::move(storageRoot))); }
  }
  Json step(Session &session, Json input) {
    const auto generation = session.generation();
    resetIfChanged(generation);
    if (!replay_) {
      if (input.contains("loaded")) { throw Error("validation_error", "Recorded loaded input requires replay mode"); }
      auto loaded = worker_ ? worker_->takeLoaded(generation) : Json::array();
      if (!worker_) { while (!pending_.empty() && loaded.size() < 2) { const auto &value = pending_.front(); loaded.push_back({{"scope", value.at("scope")}, {"slot", value.at("slot")}, {"data", value.at("data")}}); pending_.pop_front(); } }
      if (!loaded.empty()) { input["loaded"] = loaded; }
    }
    auto frame = session.step(input);
    lastInput_ = input;
    if (replay_) { return frame; }
    resetIfChanged(frame.at("generation").get<std::uint64_t>());
    for (const auto &request : frame.at("hostRequests")) {
      if (worker_) { worker_->submit(request); continue; }
      Json data = nullptr;
      try {
        data = memory_.perform(request);
        if (request.at("kind") == "load" && data.is_null()) { diagnostic("JSON save slot is empty"); }
      } catch (const std::exception &error) { diagnostic(error.what()); }
      if (request.at("kind") == "load") {
        if (pending_.size() >= 8) { diagnostic("JSON save load queue is full"); }
        else { auto completion = request; completion["data"] = data; pending_.push_back(std::move(completion)); }
      }
    }
    return frame;
  }
  void drain() { if (worker_) { worker_->drain(); } }
  const Json &lastInput() const noexcept { return lastInput_; }
  Json report() const { return {{"persistence", durable_ ? "durable" : "memory"}, {"replay", replay_}, {"diagnostics", worker_ ? worker_->diagnostics() : diagnosticsSnapshot()}}; }
private:
  bool durable_ = false, replay_ = false;
  std::uint64_t generation_ = 0;
  JsonSaveStore memory_;
  std::unique_ptr<JsonSaveWorker> worker_;
  std::deque<Json> pending_;
  struct DiagnosticState {
    std::mutex mutex;
    Json values = Json::array();
  };
  // Keep the host movable for editor session replacement. Only report data is
  // shared with the GUI, so the simulation and storage work never hold this lock.
  std::unique_ptr<DiagnosticState> diagnostics_ = std::make_unique<DiagnosticState>();
  Json lastInput_ = Json::object();
  Json diagnosticsSnapshot() const {
    std::scoped_lock lock(diagnostics_->mutex);
    return diagnostics_->values;
  }
  void diagnostic(const std::string &message) {
    std::scoped_lock lock(diagnostics_->mutex);
    if (diagnostics_->values.size() < 256) {
      diagnostics_->values.push_back(message.substr(0, 4096));
    }
  }
  void resetIfChanged(std::uint64_t generation) {
    if (generation != generation_) {
      pending_.clear(); generation_ = generation;
      if (worker_) { worker_->reset(generation); }
    }
  }
};
} // namespace nodetool::game
