pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// One effect in the list. A drag works with nothing selected, so the row stays live, and its tooltip
// and dimmed label say when a double-click has nothing to act on.
Item {
    id: row
    required property var panel
    required property string kind
    required property string effectType
    required property string label
    readonly property string reason: panel.disabledReason(kind)
    readonly property bool dragging: dragPoint.Drag.active
    readonly property bool dropAllowed: !!dragPoint.Drag.target && dragPoint.Drag.target.dropAllowed !== false
    function canApplyTo(clip) { return panel.canApply(kind, clip) }
    function applyToClip(clip) { return panel.applyTo(kind, effectType, label, [clip]) }
    implicitHeight: Ui.Metrics.compact
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: label
    Accessible.description: reason !== "" ? reason : "Add to the selection"
    Accessible.onPressAction: panel.applyToSelection(kind, effectType, label)
    Keys.onReturnPressed: panel.applyToSelection(kind, effectType, label)
    Keys.onEnterPressed: panel.applyToSelection(kind, effectType, label)
    Rectangle {
        anchors.fill: parent
        radius: Ui.Metrics.radiusControl
        color: mouse.pressed ? Ui.Theme.actionPressed : mouse.containsMouse ? Ui.Theme.actionHover : "transparent"
        border.width: Ui.Metrics.focus
        border.color: row.activeFocus ? Ui.Theme.borderFocus : "transparent"
    }
    Ui.Text {
        anchors.verticalCenter: parent.verticalCenter
        x: Ui.Metrics.md
        width: parent.width - 2 * x
        text: row.label
        elide: Text.ElideRight
        role: Ui.Typography.SansLabel
        tone: row.reason === "" ? Ui.Text.Primary : Ui.Text.Secondary
    }
    Item {
        id: dragPoint
        width: 1
        height: 1
        Drag.active: mouse.drag.active
        Drag.keys: ["application/x-nodetool-effect"]
        Drag.source: row
        Drag.supportedActions: Qt.CopyAction
        Drag.proposedAction: Qt.CopyAction
    }
    MouseArea {
        id: mouse
        objectName: "effectsPanelRowPointer"
        anchors.fill: parent
        hoverEnabled: true
        preventStealing: true
        drag.target: dragPoint
        cursorShape: row.dragging ? (row.dropAllowed ? Qt.DragCopyCursor : Qt.ForbiddenCursor) : Qt.PointingHandCursor
        onPressed: event => {
            row.forceActiveFocus()
            dragPoint.x = event.x
            dragPoint.y = event.y
        }
        onPositionChanged: event => {
            if (!drag.active) return
            dragPoint.x = event.x
            dragPoint.y = event.y
        }
        onReleased: event => {
            if (!drag.active) return
            dragPoint.x = event.x
            dragPoint.y = event.y
            dragPoint.Drag.drop()
        }
        onCanceled: dragPoint.Drag.cancel()
        onDoubleClicked: row.panel.applyToSelection(row.kind, row.effectType, row.label)
    }
    Ui.Tooltip {
        trigger: row
        visible: mouse.containsMouse && !mouse.pressed
        text: row.reason !== "" ? row.reason : "Double-click to add to the selection, or drag onto a clip"
    }
}
