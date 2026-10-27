#include "app/startup/LocalDocumentSaver.h"

#include <QCoreApplication>
#include <QSaveFile>

namespace nt::app {
LocalDocumentSaver::LocalDocumentSaver(TimelineModel& model, QString path, int debounceMs, QObject* parent)
    : QObject(parent), m_model(&model), m_path(std::move(path)) {
    m_timer.setSingleShot(true);
    m_timer.setInterval(debounceMs);
    const auto schedule = [this] {
        if (!m_active) { return; }
        m_dirty = true;
        m_timer.start();
    };
    connect(model.undoStack(), &QUndoStack::indexChanged, this, schedule);
    connect(&model, &TimelineModel::commandSettled, this, schedule);
    connect(&model, &TimelineModel::documentReplaced, this, [this] {
        m_active = false;
        m_dirty = false;
        m_timer.stop();
    });
    connect(&m_timer, &QTimer::timeout, this, [this] { flush(); });
    if (auto* app = QCoreApplication::instance()) {
        connect(app, &QCoreApplication::aboutToQuit, this, [this] { flush(); });
    }
}
LocalDocumentSaver::~LocalDocumentSaver() { flush(); }

int exitCodeAfterLocalSave(LocalDocumentSaver* saver, int rc) {
    return !saver || saver->flush() ? rc : 4;
}

bool LocalDocumentSaver::flush() {
    m_timer.stop();
    if (!m_active || !m_dirty || !m_model) { return true; }
    QSaveFile file(m_path);
    const auto bytes = m_model->documentJson();
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        emit saveFailed(QStringLiteral("Cannot save %1: %2").arg(m_path, file.errorString()));
        return false;
    }
    m_dirty = false;
    return true;
}
}
