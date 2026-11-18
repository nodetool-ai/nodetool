#include "server/ServerTimelineLoader.h"

#include "server/ServerTimeline.h"

#include <QDeadlineTimer>
#include <QThread>

#include <memory>
#include <mutex>
#include <utility>
#include <vector>

namespace nt::server {
namespace {

// The worker publishes the result once. The UI thread takes it after the
// queued finished signal. The mutex guards the result across both threads.
struct WorkerResult {
    std::mutex mutex;
    ServerOpenResult value;
};

}  // namespace

ServerLoaderWorkers::~ServerLoaderWorkers() {
    shutdown();
}

void ServerLoaderWorkers::shutdown() {
    if (std::exchange(m_stopped, true)) {
        return;
    }
    const auto workers = findChildren<QThread*>(Qt::FindDirectChildrenOnly);
    for (auto* worker : workers) {
        worker->requestInterruption();
    }
    // ServerClient and AssetCache poll interruption every 25 ms and abort
    // an in-flight reply. A missed deadline must fail before Qt teardown.
    const QDeadlineTimer deadline(5000);
    for (auto* worker : workers) {
        if (!worker->wait(deadline)) {
            qFatal("ServerLoaderWorkers: interrupted worker did not exit within 5 seconds");
        }
    }
}

QThread* ServerLoaderWorkers::makeWorker(std::function<void()> run) {
    auto* worker = QThread::create(std::move(run));
    worker->setParent(this);
    return worker;
}

ServerTimelineLoader::ServerTimelineLoader(ServerLoaderWorkers& workers, QUrl origin, QString token,
                                           QString cacheDir, QObject* parent)
    : TimelineDocumentLoader(parent), m_workers(&workers), m_origin(std::move(origin)), m_token(std::move(token)),
      m_cacheDir(std::move(cacheDir)) {}

ServerTimelineLoader::~ServerTimelineLoader() {
    cancel();
    if (m_worker) {
        disconnect(m_worker, nullptr, this, nullptr);
    }
}

void ServerTimelineLoader::load(const QString& timelineId, const QUuid& request) {
    cancel();
    if (!m_workers || m_workers->m_stopped) {
        emit failed(timelineId, request, tr("The timeline loader is shutting down."));
        return;
    }
    if (m_worker) {
        m_pending = Request{timelineId, request};
    } else {
        start({timelineId, request});
    }
}

void ServerTimelineLoader::cancel() {
    m_pending.reset();
    m_discard = true;
    if (m_worker) {
        m_worker->requestInterruption();
    }
}

void ServerTimelineLoader::start(const Request& request) {
    m_discard = false;
    ServerOpenOptions options;
    options.server = m_origin;
    options.timelineId = request.id;
    options.cacheRoot = m_cacheDir;
    options.token = m_token;
    // The worker and the queued completion share this storage. Either can
    // outlive the other when the loader is destroyed.
    auto result = std::make_shared<WorkerResult>();
    auto* worker = m_workers->makeWorker([options = std::move(options), result] {
        auto value = openServerTimeline(options);
        if (QThread::currentThread()->isInterruptionRequested()) {
            return;
        }
        const std::lock_guard lock(result->mutex);
        result->value = std::move(value);
    });
    m_worker = worker;
    const QPointer<ServerTimelineLoader> loader(this);
    connect(worker, &QThread::finished, this, [loader, request, result] {
        if (!loader) {
            return;
        }
        ServerOpenResult value;
        {
            const std::lock_guard lock(result->mutex);
            value = std::move(result->value);
        }
        loader->finish(request, std::move(value));
    }, Qt::QueuedConnection);
    connect(worker, &QThread::finished, worker, &QObject::deleteLater, Qt::QueuedConnection);
    worker->start();
}

void ServerTimelineLoader::finish(const Request& request, ServerOpenResult result) {
    m_worker.clear();
    if (!m_workers || m_workers->m_stopped) {
        m_pending.reset();
        return;
    }
    if (m_pending) {
        const Request next = std::move(*m_pending);
        m_pending.reset();
        result.mediaLeases.clear();
        start(next);
        return;
    }
    if (m_discard) {
        return;
    }
    if (!result.timeline) {
        emit failed(request.id, request.token, result.error);
        return;
    }
    // Consumers can keep the document and the cache pins past signal
    // delivery. The cache pins have no QObject affinity.
    emit loaded(request.id, request.token, std::make_shared<const Timeline>(std::move(*result.timeline)),
                std::make_shared<std::vector<AssetCache::Lease>>(std::move(result.mediaLeases)));
}

}  // namespace nt::server
