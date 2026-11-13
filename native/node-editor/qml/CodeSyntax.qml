import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Code 1.0

Item {
    id: syntax
    property var target: null
    CodeHighlighter {
        source: syntax.target
        keyword: Ui.Theme.statusInfo
        literal: Ui.Theme.statusSuccess
        comment: Ui.Theme.textSecondary
    }
}
