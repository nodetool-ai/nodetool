#pragma once
#include "assets/AssetMedia.h"
#include "server/ServerSource.h"
#include <QObject>
#include <QPointer>
#include <QSet>
#include <QThread>
#include <deque>
#include <memory>

class TimelineModel;
namespace nt::motion {
// Fetches the generated mattes the open timeline names from the server it
// was read from (MediaSource), one at a time on a worker thread.
//
// Thread affinity: UI thread. The worker reads only copies of the source and
// the asset id, and the shared MediaProtection, which is thread-safe. Its
// result reaches the UI thread through QThread::finished, a queued signal.
// The destructor interrupts and joins the worker.
class MatteResolver final : public QObject {
public:
    MatteResolver(TimelineModel& model, nt::server::MediaSource source, nt::server::AssetCacheRoot cache);
    ~MatteResolver() override;
private:
    void reset();
    void scan(bool all);
    void next();
    QPointer<TimelineModel> m_model;
    nt::server::MediaSource m_source;
    // Shared with the running worker, which uses it after a reset() here
    // has moved to a new generation.
    std::shared_ptr<nt::assets::MediaProtection> m_protection;
    QPointer<QThread> m_worker;
    QSet<QString> m_queued;
    std::deque<QString> m_pending;
};
}
