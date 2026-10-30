import QtQuick
import QtQuick.Controls

ApplicationWindow {
    width: 1000
    height: 760
    visible: true
    title: qsTr("NodeTool Chat")
    color: ChatTheme.background
    palette.window: ChatTheme.background
    palette.base: ChatTheme.paper
    palette.button: ChatTheme.paper
    palette.text: ChatTheme.text
    palette.windowText: ChatTheme.text
    palette.buttonText: ChatTheme.text
    palette.highlight: ChatTheme.primary
    palette.highlightedText: ChatTheme.background
    font.family: ChatTheme.sans
    font.pixelSize: ChatTheme.label
    ChatPanel { anchors.fill: parent; session: chatSession }
}
