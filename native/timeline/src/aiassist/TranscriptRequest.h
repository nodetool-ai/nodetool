#pragma once
#include "ai/GenerationTransport.h"
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
class TranscriptRequest : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY changed)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool hasCandidate READ hasCandidate NOTIFY changed)
    Q_PROPERTY(QString error READ error NOTIFY changed)
public:
    explicit TranscriptRequest(QObject* parent = nullptr);
    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* model);
    bool ready() const { return m_transport.ready(); }
    bool busy() const { return m_busy; }
    bool hasCandidate() const { return !m_candidate.isEmpty(); }
    QString error() const { return m_error; }
    Q_INVOKABLE bool open();
    Q_INVOKABLE bool submit(const QString& clipId, const QString& provider, const QString& model);
    Q_INVOKABLE bool apply();
    Q_INVOKABLE void cancel();
    static QJsonObject applyCaption(QJsonObject document, const QJsonObject& payload);
    void receive(const QJsonObject& frame);
signals:
    void changed();
private:
    friend class TranscriptTest;
    void persist();
    QPointer<TimelineModel> m_timeline;
    nt::ai::GenerationTransport m_transport;
    QJsonObject m_observed;
    QJsonObject m_candidate;
    QString m_clipId;
    QString m_requestId;
    QString m_error;
    QString m_recoveryFile;
    quint64 m_generation = 0;
    bool m_busy = false;
};
