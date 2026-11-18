#pragma once

#include "model/TimelineDocumentLoader.h"

#include <QPointer>
#include <QUrl>

#include <optional>

class QThread;

namespace nt::server {

struct ServerOpenResult;

// UI thread only. The host owns the loader. The application owns each
// worker until it exits, so destruction of the loader can cancel and return.
// One worker drains at a time. A new load replaces any pending request.
class ServerTimelineLoader final : public TimelineDocumentLoader {
    Q_OBJECT

public:
    ServerTimelineLoader(QUrl origin, QString token, QString cacheDir, QObject* parent = nullptr);
    ~ServerTimelineLoader() override;

    void load(const QString& timelineId) override;
    void cancel() override;

private:
    void start(const QString& id);
    void finish(const QString& id, ServerOpenResult result);

    QUrl m_origin;
    QString m_token;
    QString m_cacheDir;
    QPointer<QThread> m_worker;
    std::optional<QString> m_pending;
    bool m_discard = false;
};

}  // namespace nt::server
