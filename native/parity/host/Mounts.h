#pragma once
#include <QJsonObject>
#include <QObject>
#include <QSize>
#include <QString>
#include <QStringList>
#include <QUrl>
#include <QVariantMap>
#include <memory>
#include <vector>

class QQuickItem;

namespace nodetool::parity {

// One editor QML component loaded on its own: the interface objects it takes,
// filled from a scenario fixture by the same functions the editor window uses.
//
// The mount owns its interface objects by value or unique_ptr. The host keeps
// the mount alive until the QML root that borrows them is destroyed.
//
// UI thread only.
class Mount {
public:
    virtual ~Mount() = default;
    // The component's file in the NodeTool.NodeEditor module.
    virtual QUrl source() const = 0;
    // The required properties, as non-owning QObject pointers.
    virtual QVariantMap initialProperties() = 0;
    // The interfaces whose *Requested signals form the intent log.
    virtual std::vector<QObject *> interfaces() = 0;
    // The size the editor window gives the component.
    virtual QSize size() const = 0;
    // What the editor window does after it shows the component.
    virtual void opened(QQuickItem &root) { (void)root; }
    // The component's state that a scenario compares, read from its root.
    virtual QJsonObject probe(QQuickItem &root) const = 0;
};

// A mount for a component name ("NodeMenu"), or nullptr when the host has no
// mount for it. `error` explains a fixture it cannot read.
std::unique_ptr<Mount> makeMount(const QString &component, const QJsonObject &fixture, QString &error);
QStringList mountNames();

}  // namespace nodetool::parity
