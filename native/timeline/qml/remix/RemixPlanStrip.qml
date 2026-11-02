// The plan of a remix on two rows. The top row is the source with the stretches the
// result plays. The bottom row is the result, piece after piece, with a mark at every
// cut. Pieces that share a shade are the same stretch of music.
import QtQuick
import NodeTool.UiPrimitives as Ui

Column {
    id: strip
    // {srcFrom, srcTo, outFrom, outTo}, each a fraction.
    property var pieces: []
    property string sourceLabel: "Source"
    property string resultLabel: "Result"
    spacing: Ui.Metrics.sm

    component Lane: Item {
        id: lane
        property string label: ""
        property bool result: false
        width: strip.width
        height: Ui.Metrics.xxl
        Ui.Text {
            id: caption
            width: Ui.Metrics.xxxl * 2
            anchors.verticalCenter: parent.verticalCenter
            text: lane.label
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Rectangle {
            id: track
            objectName: lane.result ? "remixResultLane" : "remixSourceLane"
            x: caption.width
            width: parent.width - caption.width
            height: parent.height
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.surfaceInput
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderControl
            clip: true
            Repeater {
                model: strip.pieces
                delegate: Rectangle {
                    required property var modelData
                    required property int index
                    objectName: (lane.result ? "remixResultPiece" : "remixSourcePiece") + index
                    readonly property real from: lane.result ? modelData.outFrom : modelData.srcFrom
                    readonly property real to: lane.result ? modelData.outTo : modelData.srcTo
                    x: from * track.width
                    width: Math.max(Ui.Metrics.micro, (to - from) * track.width)
                    height: track.height
                    color: Ui.Theme.accentPrimary
                    opacity: index % 2 === 0 ? 1 : 0.6
                    // A replayed stretch shows through the other pieces on the source row.
                    border.width: lane.result ? 0 : Ui.Metrics.border
                    border.color: Ui.Theme.surfaceOverlay
                }
            }
            Repeater {
                model: lane.result ? Math.max(0, strip.pieces.length - 1) : 0
                delegate: Rectangle {
                    required property int index
                    objectName: "remixCut" + index
                    x: strip.pieces[index].outTo * track.width - width / 2
                    width: Ui.Metrics.border * 2
                    height: track.height
                    color: Ui.Theme.textPrimary
                }
            }
        }
    }

    Lane { label: strip.sourceLabel }
    Lane { label: strip.resultLabel; result: true }
}
