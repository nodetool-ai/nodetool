#pragma once
#include <QObject>
#include <QVariantList>
#include <QVariantMap>
#include <QtQmlIntegration/qqmlintegration.h>
#include <functional>

namespace nt::app {
struct MenuItem {
    QString kind;
    QString action;
    QString label;
    QString shortcut;
    std::function<bool(const QVariantMap&)> enabled;
};
bool registerMenuItem(MenuItem item);
}
class MenuRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit MenuRegistry(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantList query(const QString& kind, const QVariantMap& context) const;
};
