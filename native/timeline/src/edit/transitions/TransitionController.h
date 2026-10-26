#pragma once
#include "model/TimelineModel.h"
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

class TransitionController : public QObject {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* model READ model WRITE setModel NOTIFY modelChanged)
    Q_PROPERTY(QVariantMap document READ document NOTIFY documentChanged)
public:
    explicit TransitionController(QObject* parent = nullptr) : QObject(parent) {}
    TimelineModel* model() const { return m_model; }
    void setModel(TimelineModel* model);
    QVariantMap document() const;
    Q_INVOKABLE bool apply(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void beginGesture(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE void preview(const QJsonObject& payload);
    Q_INVOKABLE void commit(const QString& action, const QJsonObject& payload);
    Q_INVOKABLE bool easingReadable(const QString& value) const;
signals:
    void modelChanged();
    void documentChanged();
private:
    QPointer<TimelineModel> m_model;
    QJsonObject m_before;
    QJsonObject m_payload;
    QString m_action;
    quint64 m_generation = 0;
    bool m_gesture = false;
};
