pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
Column {
    id: root
    required property ClipInspectorController controller
    required property var row
    readonly property var state: {
        const clip = controller.clip
        const playhead = controller.playheadMs
        return controller.rowState(row.id)
    }
    readonly property bool fieldDisabled: controller.locked || (state.keyframed && controller.playheadMs < 0)
    spacing: Theme.spacingMicro
    InspectorRow {
        id: propertyRow
        width: parent.width
        label: "      " + root.row.label
        KeyframeButton {
            parent: propertyRow
            x: Theme.spacingXs
            anchors.verticalCenter: parent.verticalCenter
            text: "◷"
            active: root.state.keyframed
            enabled: !root.controller.locked && root.controller.playheadMs >= 0
            label: root.controller.playheadMs < 0 ? "Move the playhead onto the clip to animate" : (root.state.keyframed ? "Stop animating " : "Animate ") + root.row.label
            onClicked: root.controller.write({action:"stopwatch",row:root.row.id})
        }
        Repeater {
            model: root.row.inputs
            delegate: InspectorPillInput {
                required property var modelData
                required property int index
                objectName: root.row.id + "-input-" + index
                readonly property real displayScale: modelData.displayScale || 1
                value: ((root.state.values[index] || 0)*displayScale).toFixed(modelData.decimals)
                unit: modelData.unit
                minWidth: 64
                ariaLabel: modelData.label
                disabled: root.fieldDisabled
                scrub: ({step:modelData.step,min:modelData.min,max:modelData.max})
                function payload(raw) { return {action:"input",row:root.row.id,input:index,value:Number(raw)/displayScale} }
                onGestureStarted: root.controller.beginGesture()
                onPreview: raw => { if (raw.trim() !== "" && Number.isFinite(Number(raw))) root.controller.preview(payload(raw)) }
                onCommit: raw => { if (raw.trim() !== "" && Number.isFinite(Number(raw))) root.controller.commit(payload(raw)); else root.controller.cancelGesture() }
            }
        }
    }
    RowLayout {
        width: parent.width
        visible: root.state.keyframed
        spacing: Theme.spacingXs
        KeyframeLane {
            Layout.fillWidth: true
            controller: root.controller
            rowId: root.row.id
            timesMs: root.state.times
        }
        KeyframeButton { text: "‹"; label: "Previous keyframe"; enabled: root.state.hasPrev; onClicked: root.controller.step(root.row.id,-1) }
        KeyframeButton { text: "◆"; label: root.state.here ? "Delete keyframe at playhead" : "Add keyframe at playhead"; active: root.state.here; enabled: !root.controller.locked && root.controller.playheadMs >= 0; onClicked: root.controller.write({action:"toggle",row:root.row.id}) }
        KeyframeButton { text: "›"; label: "Next keyframe"; enabled: root.state.hasNext; onClicked: root.controller.step(root.row.id,1) }
    }
}
