import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
Text {
    property string value: ""
    text: value
    font.family: Theme.monoFamily
    font.pixelSize: Theme.fontSizeSmall
    color: Theme.textSecondary
    width: Math.min(implicitWidth, InspectorTokens.staticValueMaxWidth)
    elide: Text.ElideRight
    ToolTip.visible: hover.hovered
    ToolTip.text: value
    HoverHandler { id: hover }
}
