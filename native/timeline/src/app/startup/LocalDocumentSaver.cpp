#include "app/startup/LocalDocumentSaver.h"

#include "model/TimelineJson.h"

#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QSaveFile>

namespace nt::app {
LocalDocumentSaver::LocalDocumentSaver(TimelineModel& model, QString path, int debounceMs, QObject* parent)
    : QObject(parent), m_model(&model), m_path(std::move(path)) {
    if (QFile file(m_path); file.open(QIODevice::ReadOnly)) {
        const auto root = QJsonDocument::fromJson(file.readAll()).object();
        if (nt::isTimelineFile(root)) { m_timelineFile = root; }
    }
    m_timer.setSingleShot(true);
    m_timer.setInterval(debounceMs);
    const auto schedule = [this] {
        if (!m_active) { return; }
        if (!m_model) { return; }
        m_committedDocument = m_model->timeline().raw;
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

QByteArray LocalDocumentSaver::bytes() const {
    const TimelineModel::Measurement measurement(*m_model, "local_serialize");
    if (m_timelineFile.isEmpty()) { return QJsonDocument(m_committedDocument).toJson(QJsonDocument::Compact); }
    return QJsonDocument(nt::timelineFileWithSequence(m_timelineFile, m_committedDocument)).toJson();
}

int exitCodeAfterLocalSave(LocalDocumentSaver* saver, int rc) {
    return !saver || saver->flush() ? rc : 4;
}

bool LocalDocumentSaver::flush() {
    m_timer.stop();
    if (!m_active || !m_dirty || !m_model) { return true; }
    QSaveFile file(m_path);
    const auto bytes = this->bytes();
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        m_lastError = QStringLiteral("Cannot save %1: %2").arg(m_path, file.errorString());
        emit saveFailed(m_lastError);
        return false;
    }
    m_dirty = false;
    m_lastError.clear();
    return true;
}
}
