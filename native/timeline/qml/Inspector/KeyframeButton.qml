import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Ui.ToolbarIconButton {
    property string label: ""
    iconName: text === "×" ? "close"
            : text === "‹" ? "navigateBefore"
            : text === "›" ? "navigateNext"
            : "keyframeDiamond"
    display: Basic.AbstractButton.IconOnly
    accessibleName: label
    description: label
}
