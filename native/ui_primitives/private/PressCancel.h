#pragma once

#include <QObject>
#include <QQmlEngine>
#include <QQuickItem>

class PressCancel : public QObject {
    Q_OBJECT
    QML_ELEMENT

public:
    explicit PressCancel(QObject *parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE void cancel(QQuickItem *item) const;
};
