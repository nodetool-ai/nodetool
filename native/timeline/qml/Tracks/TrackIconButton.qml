import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: button
    property string iconKey: ""
    property string label: ""
    property string tone: "idle"
    readonly property bool engaged: tone === "warning" || tone === "success"
    density: Ui.EditorButton.Compact
    variant: Ui.EditorButton.Flat
    iconName: label === "" ? iconKey : ""
    text: label
    accessibleName: label !== "" ? label : iconKey
    iconTone: tone === "warning" ? Ui.Text.Warning
              : tone === "success" ? Ui.Text.Success
              : tone === "dim" ? Ui.Text.Disabled : Ui.Text.Secondary
    textTone: iconTone
    active: engaged
}
