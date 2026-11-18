// Plays one timeline by its ID: the picture, drawn by PreviewCompositor at
// the controller's clock, over transport controls. The host supplies
// `loader`, and `audioMode` when the player should make sound. `controls`
// shows the transport row, and `compact` keeps only Play and the position
// slider, for a node card. While the window renders with the software scene
// graph the player shows a short message and no picture.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui

Item {
    id: player
    property alias timelineId: playerController.timelineId
    property alias loader: playerController.loader
    property alias audioMode: playerController.audioMode
    property bool controls: true
    property bool compact: false
    readonly property TimelinePlayerController controller: playerController
    readonly property bool ready: playerController.status === TimelinePlayerController.Ready

    function clockText(ms) {
        const total = Math.max(0, Math.floor(ms / 1000))
        const seconds = total % 60
        return Math.floor(total / 60) + ":" + (seconds < 10 ? "0" : "") + seconds
    }
    function statusText() {
        switch (playerController.status) {
        case TimelinePlayerController.Idle: return qsTr("No timeline selected")
        case TimelinePlayerController.Loading: return qsTr("Loading timeline")
        case TimelinePlayerController.Error: return playerController.error
        case TimelinePlayerController.Unavailable: return qsTr("Playback needs GPU rendering")
        }
        return ""
    }

    implicitWidth: compact ? Ui.Metrics.panelWidth : Ui.Metrics.dialogCompactWidth
    implicitHeight: picture.implicitHeight + (controls ? transport.implicitHeight : 0)

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.none

        Rectangle {
            id: picture
            objectName: "timelinePlayerPicture"
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: width * 9 / 16
            color: Ui.Theme.surfaceCanvas
            clip: true

            // Declared before the controller, so the compositor goes first
            // when the player is destroyed.
            Loader {
                id: compositorLoader
                anchors.fill: parent
                active: playerController.status !== TimelinePlayerController.Unavailable
                visible: player.ready
                sourceComponent: PreviewCompositor {
                    objectName: "timelinePlayerCompositor"
                    timeline: playerController.source
                    clock: playerController.clock
                }
            }

            ColumnLayout {
                anchors.centerIn: parent
                width: Math.max(0, parent.width - 2 * Ui.Metrics.lg)
                visible: !player.ready
                spacing: Ui.Metrics.sm
                Ui.BusyIndicator {
                    Layout.alignment: Qt.AlignHCenter
                    visible: playerController.status === TimelinePlayerController.Loading
                    running: visible
                }
                Ui.Text {
                    objectName: "timelinePlayerStatus"
                    Layout.fillWidth: true
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    role: player.compact ? Ui.Typography.SansCaption : Ui.Typography.SansLabel
                    tone: playerController.status === TimelinePlayerController.Error ? Ui.Text.Error : Ui.Text.Secondary
                    text: player.statusText()
                }
            }
        }

        RowLayout {
            id: transport
            objectName: "timelinePlayerTransport"
            visible: player.controls
            enabled: player.ready
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.xs
            Layout.rightMargin: Ui.Metrics.sm
            spacing: player.compact ? Ui.Metrics.xs : Ui.Metrics.sm

            Ui.ToolbarIconButton {
                visible: !player.compact
                iconName: "stepBackFrame"
                accessibleName: qsTr("Step back one frame")
                onClicked: playerController.stepFrames(-1)
            }
            Ui.ToolbarIconButton {
                objectName: "timelinePlayerPlay"
                iconName: playerController.playing ? "pause" : "playArrow"
                accessibleName: playerController.playing ? qsTr("Pause") : qsTr("Play")
                onClicked: playerController.toggle()
            }
            Ui.ToolbarIconButton {
                visible: !player.compact
                iconName: "stepForwardFrame"
                accessibleName: qsTr("Step forward one frame")
                onClicked: playerController.stepFrames(1)
            }
            Ui.Slider {
                objectName: "timelinePlayerPosition"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                from: 0
                to: Math.max(1, playerController.durationMs)
                value: playerController.positionMs
                accessibleName: qsTr("Playback position")
                onValuePreviewed: next => playerController.seek(next)
                onValueCommitted: next => playerController.seek(next)
            }
            Ui.Text {
                visible: !player.compact
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
                text: player.clockText(playerController.positionMs) + " / " + player.clockText(playerController.durationMs)
            }
        }
    }

    // The clock samples its time once per frame while it plays.
    FrameAnimation {
        running: playerController.playing
        onTriggered: playerController.clock.tick()
    }

    TimelinePlayerController {
        id: playerController
        window: player.Window.window
        playbackVisible: player.visible && window !== null && window.visible
                         && window.visibility !== Window.Minimized
    }
}
