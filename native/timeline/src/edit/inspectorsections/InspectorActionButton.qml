import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    property bool outlined: true
    density: Ui.EditorButton.Compact
    variant: outlined ? Ui.EditorButton.Default : Ui.EditorButton.Flat
    accessibleName: text
}
