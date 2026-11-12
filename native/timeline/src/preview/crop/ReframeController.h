#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
class ReframeController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* model READ model WRITE setModel NOTIFY modelChanged)
    // The whole document as a map: each read converts every clip. Bind `revision` or `mediaTracks` instead.
    Q_PROPERTY(QVariantMap document READ document NOTIFY documentChanged)
    // Goes up on every document change, for a binding that must rerun but needs no copy of the document.
    Q_PROPERTY(int revision READ revision NOTIFY documentChanged)
    // The document's `mediaTracks`. Notifies only when they change.
    Q_PROPERTY(QVariantList mediaTracks READ mediaTracks NOTIFY mediaTracksChanged)
  public:
    explicit ReframeController(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    QVariantMap document() const;
    int revision() const { return m_revision; }
    QVariantList mediaTracks() const { return m_mediaTracks.toVariantList(); }
    Q_INVOKABLE bool apply(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void beginGesture(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void preview(const QJsonObject& payload);
    Q_INVOKABLE void commit(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void finishGesture();
    Q_INVOKABLE QVariantMap previewState(const QStringList& selection, double timeMs) const;
    Q_INVOKABLE double sourceMsAt(const QString& clipId, double timeMs) const;
    Q_INVOKABLE QJsonValue evaluate(const QJsonObject& request) const;
  signals:
    void modelChanged();
    void documentChanged();
    void mediaTracksChanged();

  private:
    QPointer<TimelineModel> m_model;
    void cancelGesture();
    void refresh();
    QJsonArray m_lastPreview;
    QJsonArray m_mediaTracks;
    int m_revision = 0;
    QJsonObject m_before;
    QJsonObject m_payload;
    QString m_action;
    quint64 m_generation = 0;
    bool m_gesture = false;
    bool m_cancelled = false;
};
