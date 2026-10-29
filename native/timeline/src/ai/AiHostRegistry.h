#pragma once
#include <QHash>
#include <QObject>
#include <QPointer>
#include <QtQmlIntegration/qqmlintegration.h>

class AiHostRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
    Q_PROPERTY(int revision READ revision NOTIFY changed)
public:
    explicit AiHostRegistry(QObject* parent = nullptr) : QObject(parent) {}
    int revision() const { return m_revision; }
    Q_INVOKABLE void registerHost(QObject* gestures, QObject* host);
    Q_INVOKABLE void unregisterHost(QObject* gestures, QObject* host);
    Q_INVOKABLE QObject* host(QObject* gestures) const;
signals:
    void changed();
private:
    QHash<QObject*, QPointer<QObject>> m_hosts;
    int m_revision = 0;
};
