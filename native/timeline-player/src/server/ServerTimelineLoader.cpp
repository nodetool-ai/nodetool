#include "server/ServerTimelineLoader.h"

#include "server/ServerTimeline.h"

#include <QCoreApplication>
#include <QThread>

#include <memory>
#include <mutex>
#include <utility>
#include <vector>

namespace nt::server {
namespace {

// The worker publishes the result once. The UI thread takes it after the
// queued finished signal. The mutex guards the result.
struct WorkerResult {
    std::mutex mutex;
    ServerOpenResult value;
};

}  // namespace

ServerTimelineLoader::ServerTimelineLoader(QUrl origin, QString token, QString cacheDir, QObject* parent)
    : TimelineDocumentLoader(parent), m_origin(std::move(origin)), m_token(std::move(token)),
      m_cacheDir(std::move(cacheDir)) {}

ServerTimelineLoader::~ServerTimelineLoader() {
    cancel();
    if (m_worker) {
        disconnect(m_worker, nullptr, this, nullptr);
    }
}

void ServerTimelineLoader::load(const QString& timelineId) {
    cancel();
    if (m_worker) {
        m_pending = timelineId;
    } else {
        start(timelineId);
    }
}

void ServerTimelineLoader::cancel() {
    m_pending.reset();
    m_discard = true;
    if (m_worker) {
        m_worker->requestInterruption();
    }
}

void ServerTimelineLoader::start(const QString& id) {
    m_discard = false;
    ServerOpenOptions options;
    options.server = m_origin;
    options.timelineId = id;
    options.cacheRoot = m_cacheDir;
    options.token = m_token;
    // The worker and the queued completion share this storage. Either can
    // outlive the other when the loader is destroyed.
    auto result = std::make_shared<WorkerResult>();
    auto* worker = QThread::create([options = std::move(options), result] {
        auto value = openServerTimeline(options);
        if (QThread::currentThread()->isInterruptionRequested()) {
            return;
        }
        const std::lock_guard lock(result->mutex);
        result->value = std::move(value);
    });
    // QThread::create threads also interrupt and join if the application
    // destroys them before the queued deleteLater can run.
    worker->setParent(QCoreApplication::instance());
    m_worker = worker;
    const QPointer<ServerTimelineLoader> loader(this);
    connect(worker, &QThread::finished, this, [loader, id, result] {
        if (!loader) {
            return;
        }
        ServerOpenResult value;
        {
            const std::lock_guard lock(result->mutex);
            value = std::move(result->value);
        }
        loader->finish(id, std::move(value));
    }, Qt::QueuedConnection);
    connect(worker, &QThread::finished, worker, &QObject::deleteLater, Qt::QueuedConnection);
    worker->start();
}

void ServerTimelineLoader::finish(const QString& id, ServerOpenResult result) {
    m_worker.clear();
    if (m_pending) {
        const QString next = std::move(*m_pending);
        m_pending.reset();
        result.mediaLeases.clear();
        start(next);
        return;
    }
    if (m_discard) {
        return;
    }
    if (!result.timeline) {
        emit failed(id, result.error);
        return;
    }
    // Consumers can keep the document and the cache pins past signal
    // delivery. The cache pins have no QObject affinity.
    emit loaded(id, std::make_shared<const Timeline>(std::move(*result.timeline)),
                std::make_shared<std::vector<AssetCache::Lease>>(std::move(result.mediaLeases)));
}

}  // namespace nt::server
