import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// Timeline tool labels collapse to icons when the toolbar is narrow.
Ui.ToolbarIconButton {
    id: button
    property string label: ""
    property string shortcut: ""
    property bool compact: false
    property bool iconOnly: false
    readonly property bool showLabel: !compact && !iconOnly
    readonly property string heading: shortcut !== "" ? label + " (" + shortcut + ")" : label
    text: showLabel ? label : ""
    display: showLabel ? Basic.AbstractButton.TextBesideIcon : Basic.AbstractButton.IconOnly
    accessibleName: label
    shortcutText: shortcut
}
