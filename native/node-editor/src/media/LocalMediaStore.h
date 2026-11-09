#pragma once
// Images an in-process run produced, kept in this process instead of sent
// inline. The runner hands each GPU-texture output over as pixels
// (gr::GpuOptions::outputImages), run messages carry its local-media:// URI,
// and MediaResolver reads the pixels back. A run's images are released when
// its session drops the run.
#include <QHash>
#include <QString>
#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

namespace nodetool::node_editor {

// Straight-alpha RGBA8, width * height * 4 bytes. Null once released.
struct LocalImage {
  uint32_t width = 0;
  uint32_t height = 0;
  // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
  std::shared_ptr<const std::vector<uint8_t>> rgba;
  bool isNull() const { return !rgba; }
};

// native-rules #9: used from the runner worker thread and the GUI thread, no affinity comment at the top
class LocalMediaStore {
public:
  static constexpr char Scheme[] = "local-media://";

  // One store per process: every session shares the one in-process runner.
  static LocalMediaStore &instance() {
    // native-rules #14: process-wide singleton holding mutable state
    static LocalMediaStore store;
    return store;
  }
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
  void releaseRun(const QString &run) {
    std::lock_guard lock(mutex_);
    entries_.removeIf([&run](const auto &entry) { return entry.value().run == run; });
  }

private:
  struct Entry {
    QString run;
    LocalImage image;
  };
  // native-rules #10: mutex does not say which data it guards (entries_, next_)
  mutable std::mutex mutex_;
  QHash<QString, Entry> entries_;
  quint64 next_ = 0;
};

} // namespace nodetool::node_editor
