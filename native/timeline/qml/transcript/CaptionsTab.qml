// Caption segments: the cues the preview shows, with editable times and text, and add, split, merge
// and delete. Each edit is one undo entry on the clip that carries the words. Audio is not touched.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../Inspector/primitives/InspectorPrimitivesHelpers.js" as Helpers

Item {
    id: tab
    required property var session
    property var clock: null
    property real fps: 30
    objectName: "captionsTab"
    property int currentRow: -1
    property real currentStartMs: 0
    property real currentEndMs: 0
    property int savedRow: 0
    // The row Split, Merge and Delete act on: the one last clicked or being edited.
    property int selectedRow: -1
    readonly property var selectedCue: session.cueCount > 0 && selectedRow >= 0 ? session.cueFlags(selectedRow, session.cueCount) : null
    readonly property string lockedReason: "Unlock the clip to edit this caption."
    TextMetrics {
        id: timecodeWidth
        font: Ui.Typography.font(Ui.Typography.SansLabel)
        text: "00:00:00:00"
    }

    function syncPlayhead() {
        if (!clock) return
        const now = clock.time
        if (currentRow >= 0 && now >= currentStartMs && now < currentEndMs) return
        const row = session.cueAt(now)
        if (row === currentRow) return
        currentRow = row
        currentStartMs = session.cueStartMs(row)
        currentEndMs = session.cueEndMs(row)
        placeMark()
        if (row >= 0 && !followPause.running && !editingRow()) rowsView.positionViewAtIndex(row, ListView.Contain)
    }
    function placeMark() {
        const item = currentRow >= 0 ? rowsView.itemAtIndex(currentRow) : null
        currentMark.visible = !!item
        if (item) {
            currentMark.y = item.y
            currentMark.width = item.width
            currentMark.height = item.height
        }
    }
    // A field with the focus keeps its row where it is.
    function editingRow() { return rowsView.activeFocus }
    function commitTime(row, field, startField, endField) {
        const parsed = Helpers.parseTimecode(field.text, tab.fps)
        const start = field === startField ? parsed : session.cueStartMs(row)
        const end = field === endField ? parsed : session.cueEndMs(row)
        if (parsed === null) {
            session.setStatus("Enter a timecode such as 00:00:12:05.")
            field.text = field.value
            return
        }
        if (!session.setCueTimes(row, start, end)) field.text = field.value
    }
    function selectRow(row) {
        if (selectedRow === row) return
        selectedRow = row
        if (clock) clock.seek(session.cueStartMs(row))
    }
    function add() {
        const row = session.addCue("New caption")
        if (row < 0) return
        selectedRow = row
        rowsView.positionViewAtIndex(row, ListView.Contain)
        rowsView.forceLayout()
        const item = rowsView.itemAtIndex(row)
        if (item) { item.textField.forceActiveFocus(); item.textField.selectAll() }
    }
    onVisibleChanged: if (visible) { currentRow = -1; currentMark.visible = false; syncPlayhead() }
    Connections {
        target: tab.clock
        enabled: tab.visible
        function onTimeChanged() { tab.syncPlayhead() }
    }
    Connections {
        target: tab.session
        function onCuesChanged() {
            if (tab.selectedRow >= tab.session.cueCount) tab.selectedRow = -1
            tab.currentRow = -1
            currentMark.visible = false
            Qt.callLater(tab.syncPlayhead)
        }
    }
    // A split, merge, add or delete resets the rows. The list stays where it was.
    Connections {
        target: tab.session.cues
        function onModelAboutToBeReset() { tab.savedRow = Math.max(0, rowsView.indexAt(0, rowsView.contentY + 1)) }
        function onModelReset() {
            rowsView.forceLayout()
            if (rowsView.count > 0) rowsView.positionViewAtIndex(Math.min(tab.savedRow, rowsView.count - 1), ListView.Beginning)
        }
    }
    Timer { id: followPause; interval: 3000 }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        visible: tab.session.cueCount > 0
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "captionCount"
                Layout.fillWidth: true
                text: tab.session.cueCount === 1 ? "1 caption" : tab.session.cueCount + " captions"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.ToolbarIconButton {
                objectName: "captionAdd"
                iconName: "add"
                accessibleName: "Add a caption at the playhead"
                onClicked: tab.add()
            }
            Ui.ToolbarIconButton {
                objectName: "captionSplit"
                iconName: "contentCut"
                accessibleName: "Split the selected caption"
                enabled: !!tab.selectedCue && tab.selectedCue.canSplit && !tab.selectedCue.locked
                disabledReason: !tab.selectedCue ? "Select a caption first." : tab.selectedCue.locked ? tab.lockedReason : "A caption with one word cannot split."
                onClicked: tab.session.splitCue(tab.selectedRow)
            }
            Ui.ToolbarIconButton {
                objectName: "captionMerge"
                iconName: "link"
                accessibleName: "Merge the selected caption with the next"
                enabled: !!tab.selectedCue && tab.selectedCue.canMerge && !tab.selectedCue.locked
                disabledReason: !tab.selectedCue ? "Select a caption first." : tab.selectedCue.locked ? tab.lockedReason : "The next caption is on another clip, or there is none."
                onClicked: tab.session.mergeCue(tab.selectedRow)
            }
            Ui.ToolbarIconButton {
                objectName: "captionDelete"
                iconName: "deleteOutline"
                accessibleName: "Delete the selected caption"
                enabled: !!tab.selectedCue && !tab.selectedCue.locked
                disabledReason: !tab.selectedCue ? "Select a caption first." : tab.lockedReason
                onClicked: tab.session.deleteCue(tab.selectedRow)
            }
        }
        ListView {
            id: rowsView
            objectName: "captionRows"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: tab.session.cues
            keyNavigationEnabled: false
            boundsBehavior: Flickable.StopAtBounds
            spacing: Ui.Metrics.sm
            ScrollBar.vertical: Ui.ScrollBar {}
            onMovementStarted: followPause.restart()
            onContentYChanged: Qt.callLater(tab.placeMark)
            delegate: Rectangle {
                id: row
                required property int index
                required property string text
                required property real startMs
                required property real endMs
                required property bool locked
                readonly property alias textField: textEdit
                readonly property bool chosen: tab.selectedRow === index
                objectName: "captionRow_" + index
                width: ListView.view.width - Ui.Metrics.lg
                height: rowLayout.implicitHeight + 2 * Ui.Metrics.sm
                radius: Ui.Metrics.radiusControl
                color: chosen ? Ui.Theme.actionSelected : rowHover.hovered ? Ui.Theme.actionHover : "transparent"
                Accessible.role: Accessible.ListItem
                Accessible.name: TimelineFormat.playheadTimecode(startMs, tab.fps) + ", " + text
                Accessible.selected: chosen
                Component.onCompleted: if (index === tab.currentRow) Qt.callLater(tab.placeMark)
                HoverHandler { id: rowHover }
                TapHandler {
                    gesturePolicy: TapHandler.ReleaseWithinBounds
                    onTapped: tab.selectRow(row.index)
                }
                ColumnLayout {
                    id: rowLayout
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.margins: Ui.Metrics.sm
                    spacing: Ui.Metrics.xs
                    // Wraps in a narrow panel, so a timecode never shrinks out of sight.
                    Flow {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.TextField {
                            id: startEdit
                            objectName: "captionIn"
                            width: timecodeWidth.width + leftPadding + rightPadding
                            density: Ui.EditorButton.Compact
                            accessibleName: "Caption in"
                            value: TimelineFormat.playheadTimecode(row.startMs, tab.fps)
                            enabled: !row.locked
                            selectByMouse: true
                            onActiveFocusChanged: if (activeFocus) tab.selectRow(row.index)
                            onValueCommitted: tab.commitTime(row.index, startEdit, startEdit, endEdit)
                        }
                        Ui.TextField {
                            id: endEdit
                            objectName: "captionOut"
                            width: timecodeWidth.width + leftPadding + rightPadding
                            density: Ui.EditorButton.Compact
                            accessibleName: "Caption out"
                            value: TimelineFormat.playheadTimecode(row.endMs, tab.fps)
                            enabled: !row.locked
                            selectByMouse: true
                            onActiveFocusChanged: if (activeFocus) tab.selectRow(row.index)
                            onValueCommitted: tab.commitTime(row.index, endEdit, startEdit, endEdit)
                        }
                    }
                    Ui.TextField {
                        id: textEdit
                        objectName: "captionText"
                        Layout.fillWidth: true
                        density: Ui.EditorButton.Compact
                        accessibleName: "Caption text"
                        value: row.text
                        enabled: !row.locked
                        selectByMouse: true
                        onActiveFocusChanged: if (activeFocus) tab.selectRow(row.index)
                        onValueCommitted: next => { if (!tab.session.setCueText(row.index, next)) textEdit.text = textEdit.value }
                    }
                }
            }
            Rectangle {
                id: currentMark
                objectName: "captionCurrent"
                parent: rowsView.contentItem
                visible: false
                z: Ui.Metrics.layerOverlay
                color: "transparent"
                radius: Ui.Metrics.radiusControl
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.borderFocus
            }
        }
    }
    Ui.EmptyState {
        objectName: "captionsEmptyState"
        anchors.centerIn: parent
        visible: tab.session.cueCount === 0
        maxTextWidth: parent.width - 2 * Ui.Metrics.md
        title: "No captions yet"
        message: "Captions come from timed words. Transcribe a clip in the Transcript tab, or add a caption over an audio or video clip at the playhead."
        actionText: "Add at playhead"
        onActionTriggered: tab.add()
    }
}
