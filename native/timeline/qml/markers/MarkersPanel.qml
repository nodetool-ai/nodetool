// nt-panel: slot=left id=markers order=38 title="Markers"
// The review list of the timeline's markers: search, a colour filter, click to
// seek, double-click to edit, and multi-select delete.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

Ui.Surface {
    id: panel
    variant: Ui.Surface.Canvas
    objectName: "timelineMarkersPanel"
    readonly property var editor: {
        var at = parent
        while (at && at.timeline === undefined) at = at.parent
        return at
    }
    readonly property var timeline: editor ? editor.timeline : null
    readonly property var clock: editor ? editor.clock : null
    readonly property var markers: timeline ? timeline.markers : []
    readonly property real fps: timeline ? timeline.fps : 30
    // A palette id, "none", or "" for every colour.
    property string colorFilter: ""
    property string anchorId: ""
    readonly property alias search: searchField
    readonly property alias list: rowsView
    readonly property var rows: MarkerSession.rows(markers, searchField.text, colorFilter)
    readonly property var selected: markers.map(m => m.id).filter(id => MarkerSession.selectedIds.indexOf(id) >= 0)
    readonly property bool filtering: searchField.text.trim() !== "" || colorFilter !== ""
    clip: true

    function gesturesItem() { return editor ? Context.itemNamed(editor, "clipGestures") : null }
    function colorOf(row) { return row.color ? row.color : Ui.Theme.accentPrimary }
    function seekTo(row) { if (clock) clock.seek(row.timeMs) }
    function pick(index, mouse) {
        const row = rows[index]
        if (mouse.modifiers & Qt.ShiftModifier && anchorId !== "") {
            const ids = rows.map(r => r.id)
            const from = ids.indexOf(anchorId)
            if (from >= 0) {
                MarkerSession.selectMany(ids.slice(Math.min(from, index), Math.max(from, index) + 1))
                return
            }
        }
        anchorId = row.id
        if (mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) {
            MarkerSession.select(row.id, true)
        } else {
            MarkerSession.select(row.id)
            seekTo(row)
        }
    }
    function deleteSelected() {
        if (selected.length > 0 && timeline) {
            timeline.applyEdit("markers.remove", {ids: selected})
            MarkerSession.clearSelection()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        Ui.TextField {
            id: searchField
            objectName: "markerSearch"
            Layout.fillWidth: true
            accessibleName: "Search markers"
            placeholderText: "Search name, notes or author"
            selectByMouse: true
        }
        Flow {
            id: filters
            objectName: "markerFilters"
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Repeater {
                model: [{id: "none", name: "No colour", css: ""}].concat(MarkerSession.colors())
                delegate: Rectangle {
                    id: chip
                    required property var modelData
                    readonly property bool on: panel.colorFilter === modelData.id
                    objectName: "markerFilter_" + modelData.id
                    width: Ui.Metrics.xl
                    height: Ui.Metrics.xl
                    radius: Ui.Metrics.radiusPill
                    color: modelData.css === "" ? Ui.Theme.accentPrimary : modelData.css
                    border.width: on ? Ui.Metrics.focus : Ui.Metrics.border
                    border.color: on ? Ui.Theme.textPrimary : Ui.Theme.borderControl
                    opacity: panel.colorFilter === "" || on ? 1 : 0.4
                    activeFocusOnTab: true
                    Accessible.role: Accessible.CheckBox
                    Accessible.name: "Show " + modelData.name.toLowerCase() + " markers only"
                    Accessible.checked: on
                    Accessible.onPressAction: chip.toggle()
                    Keys.onSpacePressed: chip.toggle()
                    Keys.onReturnPressed: chip.toggle()
                    function toggle() { panel.colorFilter = on ? "" : modelData.id }
                    Rectangle {
                        anchors.fill: parent
                        anchors.margins: -Ui.Metrics.micro
                        radius: Ui.Metrics.radiusPill
                        color: "transparent"
                        visible: chip.activeFocus
                        border.width: Ui.Metrics.focus
                        border.color: Ui.Theme.borderFocus
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: { chip.toggle(); chip.forceActiveFocus() }
                    }
                    HoverHandler { id: chipHover }
                    Ui.Tooltip { trigger: chip; visible: chipHover.hovered; text: chip.modelData.name }
                }
            }
        }
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            ListView {
                id: rowsView
                objectName: "markerRows"
                anchors.fill: parent
                visible: panel.rows.length > 0
                clip: true
                model: panel.rows
                boundsBehavior: Flickable.StopAtBounds
                spacing: Ui.Metrics.micro
                ScrollBar.vertical: Ui.ScrollBar {}
                delegate: Rectangle {
                    id: row
                    required property var modelData
                    required property int index
                    readonly property bool chosen: MarkerSession.selectedIds.indexOf(modelData.id) >= 0
                    objectName: "markerRow_" + modelData.id
                    width: ListView.view.width
                    height: Math.max(Ui.Metrics.touch, detail.implicitHeight + Ui.Metrics.lg)
                    radius: Ui.Metrics.radiusControl
                    color: chosen ? Ui.Theme.actionSelected : rowHover.hovered ? Ui.Theme.actionHover : "transparent"
                    Accessible.role: Accessible.ListItem
                    Accessible.name: (modelData.label || "Marker") + ", " + MarkerSession.timecode(modelData.timeMs, panel.fps)
                    Accessible.selected: chosen
                    Rectangle {
                        id: swatch
                        x: Ui.Metrics.sm
                        anchors.verticalCenter: parent.verticalCenter
                        width: Ui.Metrics.xs
                        height: parent.height - Ui.Metrics.lg
                        radius: Ui.Metrics.micro
                        color: panel.colorOf(row.modelData)
                    }
                    ColumnLayout {
                        id: detail
                        anchors.left: swatch.right
                        anchors.leftMargin: Ui.Metrics.md
                        anchors.right: parent.right
                        anchors.rightMargin: Ui.Metrics.md
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Ui.Metrics.micro
                        Ui.Text {
                            Layout.fillWidth: true
                            text: row.modelData.label ? row.modelData.label : "Marker"
                            role: Ui.Typography.SansLabel
                            elide: Text.ElideRight
                        }
                        Ui.Text {
                            objectName: "markerRowTime"
                            Layout.fillWidth: true
                            text: MarkerSession.timecode(row.modelData.timeMs, panel.fps)
                                  + (row.modelData.durationMs > 0 ? "  (" + MarkerSession.timecode(row.modelData.durationMs, panel.fps) + ")" : "")
                                  + (row.modelData.author ? "  " + row.modelData.author : "")
                            role: Ui.Typography.MonoCaption
                            tone: Ui.Text.Secondary
                            elide: Text.ElideRight
                        }
                        Ui.Text {
                            objectName: "markerRowNote"
                            Layout.fillWidth: true
                            visible: !!row.modelData.note
                            text: row.modelData.note ? row.modelData.note.replace(/\s+/g, " ") : ""
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            elide: Text.ElideRight
                        }
                    }
                    HoverHandler { id: rowHover }
                    MouseArea {
                        anchors.fill: parent
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        onClicked: mouse => {
                            if (mouse.button === Qt.RightButton) {
                                if (!row.chosen) MarkerSession.select(row.modelData.id)
                                menu.gestures = panel.gesturesItem()
                                menu.context = {markerId: row.modelData.id, timeMs: row.modelData.timeMs, color: row.modelData.color ?? "", editable: true}
                                menu.popup(mouse.x, mouse.y)
                            } else {
                                panel.pick(row.index, mouse)
                            }
                        }
                        onDoubleClicked: mouse => {
                            if (mouse.button === Qt.LeftButton) MarkerSession.requestEdit(row.modelData.id)
                        }
                    }
                }
            }
            Ui.EmptyState {
                anchors.centerIn: parent
                visible: panel.rows.length === 0
                maxTextWidth: parent.width - 2 * Ui.Metrics.md
                title: panel.filtering ? "No matching markers" : "No markers yet"
                message: panel.filtering ? "Change the search or the colour filter." : "Press M to mark the playhead. Double-click a flag on the ruler to add a note."
                actionText: panel.filtering ? "Clear filters" : ""
                onActionTriggered: { searchField.text = ""; panel.colorFilter = "" }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "markerCount"
                Layout.fillWidth: true
                text: panel.selected.length > 0 ? panel.selected.length + " of " + panel.markers.length + " selected"
                      : panel.filtering ? panel.rows.length + " of " + panel.markers.length + " shown"
                      : panel.markers.length === 1 ? "1 marker" : panel.markers.length + " markers"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                elide: Text.ElideRight
            }
            Ui.EditorButton {
                objectName: "markerExport"
                density: Ui.EditorButton.Compact
                text: "Export CSV…"
                enabled: panel.markers.length > 0
                disabledReason: "There are no markers to export."
                onClicked: MarkerSession.requestExport()
            }
            Ui.EditorButton {
                objectName: "markerDeleteSelected"
                density: Ui.EditorButton.Compact
                text: "Delete"
                enabled: panel.selected.length > 0
                disabledReason: "Select markers to delete."
                onClicked: panel.deleteSelected()
            }
        }
    }
    RegistryContextMenu {
        id: menu
        kind: "marker"
        gestures: null
    }
    // A removed marker leaves the selection.
    Connections {
        target: panel.timeline
        function onMarkersChanged() { MarkerSession.selectMany(MarkerSession.selectedIn(panel.timeline.markers)) }
    }
}
