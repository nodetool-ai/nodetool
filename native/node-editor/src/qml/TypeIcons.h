#pragma once
#include <QObject>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nodetool::node_editor::qml {

// The Material icon paths that the canvas painter draws, for TypeIcon.qml.
// Stateless.
//
// The QML engine creates and owns one instance per engine. UI thread only.
class TypeIcons : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit TypeIcons(QObject *parent = nullptr);
    ~TypeIcons() override;

    // The SVG path data for an icon name, or empty when the editor has none.
    Q_INVOKABLE QString path(const QString &name) const;
};

}  // namespace nodetool::node_editor::qml
