import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Code 1.0

Item {
    property var target: null
    CodeHighlighter {
        source: parent.target
        keyword: Ui.Theme.statusInfo
        literal: Ui.Theme.statusSuccess
        comment: Ui.Theme.textSecondary
    }
}
