pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

TrackIconButton {
    id: button
    required property TimelineModel timeline
    objectName: "addTrackButton"
    iconKey: "add"
    Accessible.role: Accessible.Button
    Accessible.name: "Add track"
    activeFocusOnTab: true
    onClicked: menu.openAt(button)

    Ui.ContextMenu {
        id: menu
        objectName: "addTrackMenu"
        Repeater {
            model: [
                { type: "video", label: "Video" },
                { type: "audio", label: "Audio" },
                { type: "overlay", label: "Overlay" },
                { type: "subtitle", label: "Subtitle" },
                { type: "midi", label: "MIDI" },
                { type: "chord", label: "Chord track" }
            ]
            delegate: Ui.MenuItem {
                id: entry
                required property var modelData
                objectName: "addTrack-" + modelData.type
                text: modelData.label
                iconName: TimelineVisuals.trackIconName(modelData.type)
                accessibleName: modelData.label
                onTriggered: {
                    const type = modelData.type
                    button.timeline.applyEdit(type === "video" || type === "overlay" ? "insertTrack" : "addTrack",
                        { type: type, atIndex: 0 })
                }
            }
        }
    }
}
