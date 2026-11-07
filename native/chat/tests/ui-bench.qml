import QtQuick
import QtQuick.Controls
import NodeTool.Chat

ApplicationWindow {
    width: 960
    height: 1000
    visible: true
    ChatPanel { anchors.fill: parent; session: chatSession }
}
