import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    property bool destructive: false
    density: Ui.EditorButton.Compact
    variant: destructive ? Ui.EditorButton.Flat : Ui.EditorButton.Primary
    textTone: destructive ? Ui.Text.Error : Ui.Text.OnAccent
    accessibleName: text
}
