#pragma once
#include <QObject>
#include <QUrl>
#include <QVariantList>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nt::app {
struct Panel {
    QString slot;
    QString id;
    QUrl source;
    int order = 0;
    QString title;
};
bool registerPanel(Panel panel);
}
class PanelRegistry : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit PanelRegistry(QObject* parent = nullptr) : QObject(parent) {}
    Q_INVOKABLE QVariantList forSlot(const QString& slot) const;
};
