#pragma once

#include "model/TimelineTypes.h"

#include <QObject>
#include <QString>

#include <memory>

namespace nt {

// UI thread only. The host owns the loader, with optional QObject parenting.
// The receiver shares the immutable snapshot with playback and keeps the
// media leases alive for as long as the snapshot's cached files are in use.
class TimelineDocumentLoader : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    virtual void load(const QString& timelineId) = 0;
    virtual void cancel() = 0;

signals:
    void loaded(QString id, std::shared_ptr<const nt::Timeline> doc, std::shared_ptr<void> mediaLeases);
    void failed(QString id, QString message);
};

}  // namespace nt
