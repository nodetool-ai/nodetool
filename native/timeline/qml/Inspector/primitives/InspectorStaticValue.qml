import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Ui.Text {
    id: root
    property string value: ""
    text: value
    role: Ui.Typography.MonoLabel
    tone: Ui.Text.Secondary
    width: Math.min(implicitWidth, InspectorTokens.staticValueMaxWidth)
    elide: Text.ElideRight
    Ui.Tooltip { trigger: root; visible: hover.hovered; text: root.value }
    HoverHandler { id: hover }
}
