#pragma once

#include "model/TimelineDocumentLoader.h"

#include <QPointer>
#include <QUrl>

#include <functional>
#include <optional>

class QThread;

namespace nt::server {

struct ServerOpenResult;

// UI thread only. The host owns this object and destroys it before
// QCoreApplication. It owns the QThreads, even after their loaders go.
class ServerLoaderWorkers final : public QObject {
public:
    ~ServerLoaderWorkers() override;

    // Stops admitting requests, interrupts outstanding network I/O and
    // joins all workers. The destructor also calls this. Call on the UI
    // thread before application teardown if the owner will outlive the app.
    void shutdown();

private:
    friend class ServerTimelineLoader;
    QThread* makeWorker(std::function<void()> run);
    bool m_stopped = false;
};

// UI thread only. The host owns the loader. Destroying it cancels its work
// without waiting. ServerLoaderWorkers drains all outstanding workers at
// host shutdown. A new load replaces any pending request.
class ServerTimelineLoader final : public TimelineDocumentLoader {
    Q_OBJECT

public:
    ServerTimelineLoader(ServerLoaderWorkers& workers, QUrl origin, QString token, QString cacheDir,
                         QObject* parent = nullptr);
    ~ServerTimelineLoader() override;

    void load(const QString& timelineId, const QUuid& request) override;
    void cancel() override;

private:
    struct Request {
        QString id;
        QUuid token;
    };

    void start(const Request& request);
    void finish(const Request& request, ServerOpenResult result);

    QPointer<ServerLoaderWorkers> m_workers;
    QUrl m_origin;
    QString m_token;
    QString m_cacheDir;
    QPointer<QThread> m_worker;
    std::optional<Request> m_pending;
    bool m_discard = false;
};

}  // namespace nt::server
