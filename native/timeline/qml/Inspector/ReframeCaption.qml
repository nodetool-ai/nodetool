import QtQuick
import NodeTool.Timeline
Text {
    property bool warning: false
    wrapMode: Text.WordWrap
    color: warning ? Theme.warning : Theme.textSecondary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmaller
}
