#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QTimer>

namespace nt::app {
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
    QByteArray m_committedBytes;
    QTimer m_timer;
    bool m_dirty = false;
    bool m_active = true;
};
int exitCodeAfterLocalSave(LocalDocumentSaver* saver, int rc);
}
