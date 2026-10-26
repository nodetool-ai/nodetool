pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

TrackIconButton {
    id: button
    required property TimelineModel timeline
    objectName: "addTrackButton"
    icon: Icons.add
    Accessible.role: Accessible.Button
    Accessible.name: "Add track"
    activeFocusOnTab: true
    Keys.onReturnPressed: menu.open()
    Keys.onSpacePressed: menu.open()
    onClicked: menu.open()

    Menu {
        id: menu
        objectName: "addTrackMenu"
        y: button.height
        width: 180
        padding: Theme.spacingXs
        popupType: Popup.Item
        background: Rectangle {
            color: Theme.backgroundPaper
            radius: Theme.radiusLg
            border.color: Theme.divider
        }
        Repeater {
            model: [
                { type: "video", label: "Video" },
                { type: "audio", label: "Audio" },
                { type: "overlay", label: "Overlay" },
                { type: "subtitle", label: "Subtitle" },
                { type: "midi", label: "MIDI" },
                { type: "chord", label: "Chord track" }
            ]
            delegate: MenuItem {
                id: entry
                required property var modelData
                objectName: "addTrack-" + modelData.type
                text: modelData.label
                height: Theme.rulerHeight
                leftPadding: Theme.spacingMd
                rightPadding: Theme.spacingMd
                contentItem: Row {
                    spacing: Theme.spacingMd
                    Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        path: Theme.trackIcon(entry.modelData.type)
                        size: Theme.iconSm
                        color: Theme.textSecondary
                    }
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: entry.text
                        font.family: Theme.sansFamily
                        font.pixelSize: Theme.fontSizeSmall
                        color: Theme.textPrimary
                    }
                }
                background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
                onTriggered: {
                    const type = modelData.type
                    button.timeline.applyEdit(type === "video" || type === "overlay" ? "insertTrack" : "addTrack",
                        { type: type, atIndex: 0 })
                }
            }
        }
    }
}
