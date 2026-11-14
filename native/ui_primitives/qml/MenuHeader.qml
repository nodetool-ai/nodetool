import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// A section label inside a menu. It takes no hover, focus or activation.
Basic.MenuItem {
    enabled: false
    hoverEnabled: false
    leftPadding: Metrics.md
    rightPadding: Metrics.md
    implicitHeight: Metrics.compact
    contentItem: Ui.Text {
        text: parent.text
        role: Typography.SansCaption
        tone: Ui.Text.Secondary
        verticalAlignment: Text.AlignVCenter
    }
    background: null
}
