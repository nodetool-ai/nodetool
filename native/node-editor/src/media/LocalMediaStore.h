#pragma once
// Pixels and encoded audio from local runs. Messages carry local-media://
// locators. A run's entries are released when its session drops the run.
#include <QCryptographicHash>
#include <QHash>
#include <QByteArray>
#include <QCoreApplication>
#include <QObject>
#include <QThread>
#include <QString>
#include <cstdint>
#include <deque>
#include <algorithm>
#include <memory>
#include <mutex>
#include <vector>

namespace nodetool::node_editor {

// Straight-alpha RGBA8, width * height * 4 bytes. Null once released.
struct LocalImage {
  uint32_t width = 0;
  uint32_t height = 0;
  // Readers retain pixels across run eviction, so the store and readers share ownership.
  std::shared_ptr<const std::vector<uint8_t>> rgba;
  bool isNull() const { return !rgba; }
};

// Thread-safe: mutex_ guards entries, byte accounting and eviction order. Readers receive immutable values.
class LocalMediaStore {
public:
  static constexpr char Scheme[] = "local-media://";
  static constexpr qsizetype ClipByteLimit = 128 * 1024 * 1024;
  explicit LocalMediaStore(qsizetype clipByteLimit = ClipByteLimit) : clipByteLimit_(clipByteLimit) {}

  // Accessors run on the UI thread. The application owns the registry, while
  // runner callbacks retain shared() until worker shutdown finishes.
  static std::shared_ptr<LocalMediaStore> shared();
  static LocalMediaStore &instance() { return *shared(); }
  static bool isLocalMedia(const QString &uri) { return uri.startsWith(QLatin1StringView(Scheme)); }

  // Thread-safe. The runner calls it on its worker thread.
  QString add(const QString &run, uint32_t width, uint32_t height, std::vector<uint8_t> rgba) {
    auto pixels = std::make_shared<const std::vector<uint8_t>>(std::move(rgba));
    std::lock_guard lock(mutex_);
    const auto uri = QLatin1StringView(Scheme) + QString::number(++next_);
    entries_.insert(uri, Entry{run, LocalImage{width, height, std::move(pixels)}});
    return uri;
  }
  LocalImage image(const QString &uri) const {
    std::lock_guard lock(mutex_);
    return entries_.value(uri).image;
  }
  struct Clip {
    QByteArray bytes;
    QString contentType;
    bool isNull() const { return bytes.isEmpty(); }
  };
  QString addClip(const QString &run, QByteArray bytes, QString contentType) {
    std::lock_guard lock(mutex_);
    const auto key = run + ':' + QString::fromLatin1(QCryptographicHash::hash(bytes, QCryptographicHash::Sha256).toHex());
    if (clipKeys_.contains(key)) { return clipKeys_.value(key); }
    if (bytes.size() > clipByteLimit_) { return {}; }
    while (clipBytes_ + bytes.size() > clipByteLimit_ && !clipRuns_.empty()) {
      releaseRunLocked(clipRuns_.front());
    }
    if (std::find(clipRuns_.begin(), clipRuns_.end(), run) == clipRuns_.end()) { clipRuns_.push_back(run); }
    clipBytes_ += bytes.size();
    const auto uri = QLatin1StringView(Scheme) + QString::number(++next_);
    entries_.insert(uri, Entry{run, {}, Clip{std::move(bytes), std::move(contentType)}});
    clipKeys_.insert(key, uri);
    return uri;
  }
  Clip clip(const QString &uri) const {
    std::lock_guard lock(mutex_);
    return entries_.value(uri).clip;
  }
  bool contains(const QString &uri) const {
    std::lock_guard lock(mutex_);
    return entries_.contains(uri);
  }
  void releaseRun(const QString &run) {
    std::lock_guard lock(mutex_);
    releaseRunLocked(run);
  }

private:
  void releaseRunLocked(QString run) {
    for (const auto &entry : entries_) {
      if (entry.run == run) { clipBytes_ -= entry.clip.bytes.size(); }
    }
    std::erase(clipRuns_, run);
    clipKeys_.removeIf([this, &run](const auto &entry) { return entries_.value(entry.value()).run == run; });
    entries_.removeIf([&run](const auto &entry) { return entry.value().run == run; });
  }

private:
  struct Entry {
    QString run;
    LocalImage image;
    Clip clip;
  };
  // Guards all mutable store state, on both the runner and UI threads.
  mutable std::mutex mutex_;
  QHash<QString, Entry> entries_;
  QHash<QString, QString> clipKeys_;
  quint64 next_ = 0;
  const qsizetype clipByteLimit_;
  qsizetype clipBytes_ = 0;
  std::deque<QString> clipRuns_;
};

// UI thread only. QObject parent ownership ties the registry to the application.
class LocalMediaStoreOwner final : public QObject {
public:
  explicit LocalMediaStoreOwner(QObject *parent) : QObject(parent) {}
  // Worker callbacks and UI readers must retain the store independently.
  const std::shared_ptr<LocalMediaStore> store = std::make_shared<LocalMediaStore>();
};
inline std::shared_ptr<LocalMediaStore> LocalMediaStore::shared() {
  auto *application = QCoreApplication::instance();
  Q_ASSERT(application && application->thread() == QThread::currentThread());
  for (auto *child : application->children()) {
    if (auto *owner = dynamic_cast<LocalMediaStoreOwner *>(child)) { return owner->store; }
  }
  // The application QObject tree owns this registry and destroys it on exit.
  auto *owner = new LocalMediaStoreOwner(application);
  return owner->store;
}

} // namespace nodetool::node_editor
