#pragma once
#include <QColor>
#include <QFont>
#include <QObject>
#include <QtQmlIntegration/qqmlintegration.h>

namespace nodetool::node_editor::qml {

// Colors the links and code spans of a rendered Markdown output
// (TextOutput.qml) with the theme's link color, code surface and code font.
// Stateless.
//
// The QML engine creates and owns one instance per engine. UI thread only.
class OutputStyle : public QObject {
    Q_OBJECT
    QML_ELEMENT
    QML_SINGLETON
public:
    explicit OutputStyle(QObject *parent = nullptr);
    ~OutputStyle() override;

    // `document` is a QQuickTextDocument, such as TextArea.textDocument.
    Q_INVOKABLE void styleMarkdown(QObject *document, const QColor &link, const QColor &codeSurface,
                                   const QFont &codeFont) const;
};

}  // namespace nodetool::node_editor::qml
