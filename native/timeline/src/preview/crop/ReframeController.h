#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>
class ReframeController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* model READ model WRITE setModel NOTIFY modelChanged)
    Q_PROPERTY(QVariantMap document READ document NOTIFY documentChanged)
  public:
    explicit ReframeController(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    QVariantMap document() const;
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

  private:
    QPointer<TimelineModel> m_model;
    void cancelGesture();
    QJsonArray m_lastPreview;
    QJsonObject m_before;
    QJsonObject m_payload;
    QString m_action;
    quint64 m_generation = 0;
    bool m_gesture = false;
    bool m_cancelled = false;
};
