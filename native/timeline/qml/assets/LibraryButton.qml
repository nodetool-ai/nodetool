import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    property bool destructive: false
    density: Ui.EditorButton.Compact
    variant: destructive ? Ui.EditorButton.Destructive : Ui.EditorButton.Default
    accessibleName: text
}
