import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: root
    property var def: ({options:[]})
    property real value: 0
    property string accent: "n"
    property var onSet: function(value) {}
    signal setValue(real value)
    function requestSet(value) { onSet(value); setValue(value) }
    readonly property var options: def.options ?? []
    readonly property int count: Math.max(1, options.length)
    readonly property int index: Math.min(count - 1, Math.max(0, Math.round(value)))
    readonly property color accentColor: accent === "a" ? Ui.Theme.statusInfo : accent === "b" ? Ui.Theme.statusWarning : accent === "f" ? TimelineVisuals.overlay : Ui.Theme.accentPrimary
    spacing: Ui.Metrics.xs
    function step(d) { requestSet((index + d + count) % count) }
    Ui.ToolbarIconButton { objectName: "fx-step-previous"; accessibleName: "Previous"; iconName: "navigateBefore"; onClicked: root.step(-1) }
    Ui.Text { anchors.verticalCenter: parent.verticalCenter; text: root.options[root.index] ?? String(root.index); role: Ui.Typography.MonoCaption; domainColor: root.accentColor }
    Ui.ToolbarIconButton { objectName: "fx-step-next"; accessibleName: "Next"; iconName: "navigateNext"; onClicked: root.step(1) }
}
