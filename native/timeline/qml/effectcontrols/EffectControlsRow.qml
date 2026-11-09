pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
// One keyframable property: its controls in the list, its diamonds in the lane, and on request its graphs.
Column {
    id: root
    required property var panel
    required property var row
    property bool bypassed: false
    readonly property var controller: panel.controller
    readonly property string rowId: row.id
    // Reads the document on edits only, so a seek touches no diamond.
    // The text compares equal through a value preview, which keeps the lane's delegates and drags.
    readonly property string docKey: { const revision = controller.revision; return JSON.stringify(controller.rowDocument(rowId)) }
    readonly property var doc: JSON.parse(docKey)
    readonly property var live: { const revision = controller.revision; const playhead = controller.playheadMs; return controller.rowLive(rowId) }
    readonly property bool editable: !panel.locked && !bypassed && !doc.blocked
    readonly property bool active: panel.activeRow === rowId
    property bool graphsOpen: false
    readonly property real laneCenterY: controls.height / 2
    objectName: "effectControlsRow_" + rowId
    opacity: bypassed ? 0.6 : 1
    Component.onCompleted: panel.registerRow(rowId, root)
    Component.onDestruction: panel.unregisterRow(rowId, root)
    function selectRow() {
        panel.setActiveRow(rowId)
        panel.forceActiveFocus()
    }
    Item {
        id: controls
        width: root.width
        height: Ui.Metrics.compact * (root.panel.stackedRows ? 2 : 1)
        Rectangle {
            width: root.panel.listWidth
            height: parent.height
            color: root.active ? Ui.Theme.actionSelected : "transparent"
        }
        MouseArea {
            objectName: "effectControlsRowArea_" + root.rowId
            width: root.panel.listWidth
            height: parent.height
            onPressed: root.selectRow()
        }
        // Rows sit one step in from their group's heading, as Premiere indents a property under its effect.
        RowLayout {
            x: Ui.Metrics.lg
            width: root.panel.listWidth - Ui.Metrics.lg - Ui.Metrics.xs
            height: Ui.Metrics.compact
            spacing: Ui.Metrics.xs
            Ui.ToolbarIconButton {
                objectName: "effectControlsGraphs_" + root.rowId
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                opacity: root.doc.keyframed ? 1 : 0
                enabled: root.doc.keyframed
                iconName: root.graphsOpen ? "arrowDropDown" : "navigateNext"
                accessibleName: (root.graphsOpen ? "Hide graphs of " : "Show graphs of ") + root.row.label
                description: accessibleName
                onClicked: { root.graphsOpen = !root.graphsOpen; root.selectRow() }
            }
            KeyframeButton {
                objectName: "effectControlsStopwatch_" + root.rowId
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "timer"
                active: root.doc.keyframed
                enabled: root.editable && root.controller.playheadMs >= 0
                label: root.doc.blocked ? "An animation on this clip drives " + root.row.label
                    : root.controller.playheadMs < 0 ? "Move the playhead onto the clip to animate" : (root.doc.keyframed ? "Stop animating " : "Animate ") + root.row.label
                onClicked: { root.selectRow(); root.controller.write({action: "stopwatch", row: root.rowId}) }
            }
            Ui.Text {
                Layout.fillWidth: true
                Layout.minimumWidth: Ui.Metrics.xxl
                text: root.row.label
                elide: Text.ElideRight
                role: Ui.Typography.SansCaption
                tone: root.editable ? Ui.Text.Primary : Ui.Text.Disabled
            }
            // The values start in one column for all rows, after the labels.
            Item {
                visible: !root.panel.stackedRows
                Layout.preferredWidth: Math.max(inputs.width, root.panel.listWidth - root.panel.valueX - navigator.width - Ui.Metrics.sm)
                Layout.preferredHeight: 1
            }
            Row {
                id: navigator
                spacing: Ui.Metrics.micro
                KeyframeButton {
                    objectName: "effectControlsPrev_" + root.rowId
                    width: Ui.Metrics.iconLg
                    height: Ui.Metrics.iconLg
                    opacity: root.doc.keyframed ? 1 : 0
                    text: "‹"
                    label: "Previous keyframe"
                    enabled: root.doc.keyframed && root.live.hasPrev
                    onClicked: { root.selectRow(); root.controller.step(root.rowId, -1) }
                }
                KeyframeButton {
                    objectName: "effectControlsToggle_" + root.rowId
                    width: Ui.Metrics.iconLg
                    height: Ui.Metrics.iconLg
                    text: "◆"
                    label: root.live.here ? "Delete keyframe at playhead" : "Add keyframe at playhead"
                    active: root.live.here
                    // As in Premiere, the navigator shows on an animated property only.
                    opacity: root.doc.keyframed ? 1 : 0
                    enabled: root.editable && root.controller.playheadMs >= 0
                    onClicked: { root.selectRow(); root.controller.write({action: "toggle", row: root.rowId}) }
                }
                KeyframeButton {
                    objectName: "effectControlsNext_" + root.rowId
                    width: Ui.Metrics.iconLg
                    height: Ui.Metrics.iconLg
                    opacity: root.doc.keyframed ? 1 : 0
                    text: "›"
                    label: "Next keyframe"
                    enabled: root.doc.keyframed && root.live.hasNext
                    onClicked: { root.selectRow(); root.controller.step(root.rowId, 1) }
                }
            }
        }
        Row {
            id: inputs
            spacing: Ui.Metrics.micro
            x: root.panel.stackedRows ? Ui.Metrics.lg + Ui.Metrics.iconLg * 2 : root.panel.valueX
            y: root.panel.stackedRows ? Ui.Metrics.compact : (Ui.Metrics.compact - height) / 2
            Repeater {
                model: root.row.inputs
                delegate: InspectorPillInput {
                    required property var modelData
                    required property int index
                    objectName: "effectControls_" + root.rowId + "_input_" + index
                    readonly property real displayScale: modelData.displayScale || 1
                    value: ((root.live.values[index] || 0) * displayScale).toFixed(modelData.decimals)
                    unit: modelData.unit
                    minWidth: Ui.Metrics.touch * 1.45
                    quiet: true
                    quietColor: TimelineVisuals.editBlue
                    ariaLabel: modelData.label
                    disabled: !root.editable || (root.doc.keyframed && root.controller.playheadMs < 0)
                    scrub: ({step: modelData.step, min: modelData.min, max: modelData.max})
                    function payload(raw) { return {action: "input", row: root.rowId, input: index, value: Number(raw) / displayScale} }
                    function usable(raw) { return raw.trim() !== "" && Number.isFinite(Number(raw)) }
                    onGestureStarted: root.controller.beginGesture()
                    onPreview: raw => { if (usable(raw)) root.controller.preview(payload(raw)) }
                    onCommit: raw => { if (usable(raw)) root.controller.commit(payload(raw)); else root.controller.cancelGesture() }
                    onCanceled: root.controller.cancelGesture()
                }
            }
        }
        // Any press on the row makes it the active row, and goes on to the control under it.
        MouseArea {
            width: root.panel.listWidth
            height: parent.height
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onPressed: mouse => {
                root.panel.setActiveRow(root.rowId)
                mouse.accepted = false
            }
        }
        Item {
            id: lane
            objectName: "effectControlsLane_" + root.rowId
            x: root.panel.laneX
            width: root.panel.laneWidth
            height: parent.height
            clip: true
            readonly property var times: root.doc.times
            Rectangle {
                visible: lane.times.length > 1
                x: root.panel.xOf(lane.times[0] || 0)
                width: root.panel.xOf(lane.times[lane.times.length - 1] || 0) - x
                height: Ui.Metrics.border
                anchors.verticalCenter: parent.verticalCenter
                color: Ui.Theme.borderControl
            }
            Repeater {
                model: lane.times
                delegate: EffectControlsDiamond {
                    required property real modelData
                    panel: root.panel
                    rowId: root.rowId
                    rowLabel: root.row.label
                    ms: modelData
                    editable: root.editable
                    y: (lane.height - height) / 2
                    onActivated: root.selectRow()
                }
            }
        }
    }
    Loader {
        objectName: "effectControlsGraphLoader_" + root.rowId
        active: root.graphsOpen && root.doc.keyframed
        visible: active
        width: root.width
        sourceComponent: EffectControlsGraph {
            panel: root.panel
            rowId: root.rowId
            inputs: root.row.inputs
            editable: root.editable
        }
    }
}
