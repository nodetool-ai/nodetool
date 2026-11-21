// nt-panel: slot=clipBody id=takeBadge order=20 title="Take"
// The current take and the take count on a clip with more than one. A music
// clip shows its count in its name band instead (music/MusicClipJob.qml).
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property var clip: ({})
    property var timeline: null
    property var gestures: null
    property var viewState: null
    readonly property string badge: TakeInfo.badge(clip)
    anchors.fill: parent

    Rectangle {
        objectName: "takeBadge-" + root.clip.id
        visible: root.badge !== "" && root.clip.audioRole !== "music" && root.width >= width + 2 * Ui.Metrics.md
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.md
        width: label.implicitWidth + 2 * Ui.Metrics.xs
        height: label.implicitHeight
        radius: Ui.Metrics.radiusControl
        color: Ui.Theme.surfaceOverlay
        Accessible.role: Accessible.StaticText
        Accessible.name: "Take " + root.badge.replace("/", " of ")
        Ui.Text {
            id: label
            objectName: "takeBadgeText"
            anchors.centerIn: parent
            text: root.badge
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Primary
        }
    }
}
