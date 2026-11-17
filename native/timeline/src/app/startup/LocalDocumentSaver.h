#pragma once
#include "model/TimelineModel.h"
#include <QJsonObject>
#include <QPointer>
#include <QTimer>

namespace nt::app {
// Writes the open local document back to its file. UI thread only.
// A project folder's timeline file (`Timelines/<name>.timeline.json`) keeps
// its envelope: the sequence settings and `document`, with no name.
class LocalDocumentSaver : public QObject {
    Q_OBJECT
public:
    LocalDocumentSaver(TimelineModel& model, QString path, int debounceMs = 300, QObject* parent = nullptr);
    ~LocalDocumentSaver() override;
    bool flush();
signals:
    void saveFailed(const QString& error);
private:
    QPointer<TimelineModel> m_model;
    QString m_path;
    QByteArray bytes() const;
    QByteArray m_committedBytes;
    // The envelope of a project folder timeline file; empty for a plain document.
    QJsonObject m_timelineFile;
    QTimer m_timer;
    bool m_dirty = false;
    bool m_active = true;
};
int exitCodeAfterLocalSave(LocalDocumentSaver* saver, int rc);
}
