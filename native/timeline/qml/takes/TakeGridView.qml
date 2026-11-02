// The takes of the current clip in the Program monitor, beside the program
// picture. Registered in src/takes/TakeActions.cpp. A click does what the cell's number key
// does: switch while stopped, cut during a recording pass. Ctrl+click cuts.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: view
    objectName: "takeGridView"
    required property var timeline
    required property var clock
    property var gestures: null
    required property var monitor

    // The picture keeps playing beside the grid. It goes below the grid when the monitor is tall.
    readonly property bool keepsPicture: true
    readonly property bool hasTakes: grid.takeCount > 0
    readonly property bool sideBySide: width >= height
    // A small monitor gives all its room to the takes.
    readonly property bool compact: Math.min(width, height) < compactSize
    readonly property real compactSize: Ui.Metrics.dialogCompactWidth / 2
    readonly property real gridShare: compact ? 1 : 0.6
    readonly property rect pictureArea: !hasTakes || compact ? Qt.rect(0, 0, 0, 0)
        : sideBySide ? Qt.rect(width * gridShare, 0, width * (1 - gridShare), height)
        : Qt.rect(0, height * gridShare, width, height * (1 - gridShare))

    function editorAbove() {
        let item = view.parent
        while (item) {
            if (item.frameCapture !== undefined) return item
            item = item.parent
        }
        return null
    }

    TakeGrid {
        id: grid
        objectName: "takeGrid"
        gestures: view.gestures
        capture: {
            const editor = view.editorAbove()
            return editor ? editor.frameCapture : null
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Ui.Theme.surfaceCanvas
        visible: !view.hasTakes
        Ui.EmptyState {
            objectName: "takeGridEmpty"
            anchors.centerIn: parent
            maxTextWidth: Math.min(view.width - 2 * Ui.Metrics.lg, Ui.Metrics.dialogCompactWidth)
            title: "No takes here"
            message: "Select a clip with more than one take, or move the playhead over one. Generating a clip again adds a take."
            actionText: "Back to the picture"
            onActionTriggered: view.monitor.displayMode = "composite"
        }
    }

    Item {
        id: panel
        visible: view.hasTakes
        width: view.sideBySide ? view.width * view.gridShare : view.width
        height: view.sideBySide ? view.height : view.height * view.gridShare

        Item {
            id: header
            objectName: "takeGridHeader"
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Ui.Metrics.sm
            height: Math.max(pageControls.implicitHeight, recordButton.implicitHeight)

            Ui.Text {
                anchors.left: parent.left
                anchors.right: pageControls.left
                anchors.rightMargin: Ui.Metrics.sm
                anchors.verticalCenter: parent.verticalCenter
                text: grid.clipName
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Primary
            }
            Row {
                id: pageControls
                anchors.right: recordButton.left
                anchors.rightMargin: Ui.Metrics.sm
                anchors.verticalCenter: parent.verticalCenter
                spacing: Ui.Metrics.micro
                visible: grid.pageCount > 1
                width: visible ? implicitWidth : 0
                Ui.ToolbarIconButton {
                    objectName: "takeGridPreviousPage"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "navigateBefore"
                    text: "Previous takes"
                    enabled: grid.page > 0
                    onClicked: grid.previousPage()
                }
                Ui.Text {
                    objectName: "takeGridPage"
                    anchors.verticalCenter: parent.verticalCenter
                    text: (grid.page + 1) + "/" + grid.pageCount
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
                }
                Ui.ToolbarIconButton {
                    objectName: "takeGridNextPage"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "navigateNext"
                    text: "More takes"
                    enabled: grid.page < grid.pageCount - 1
                    onClicked: grid.nextPage()
                }
            }
            Ui.EditorButton {
                id: recordButton
                objectName: "takeGridRecord"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                density: Ui.EditorButton.Compact
                variant: grid.switcher !== null && grid.switcher.recording ? Ui.EditorButton.Destructive : Ui.EditorButton.Default
                text: grid.switcher !== null && grid.switcher.recording ? "Stop recording" : "Record"
                onClicked: grid.toggleRecording()
            }
        }

        Grid {
            id: cells
            objectName: "takeGridCells"
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: header.bottom
            anchors.bottom: parent.bottom
            anchors.margins: Ui.Metrics.sm
            spacing: Ui.Metrics.xs
            readonly property int count: grid.takes.length
            columns: Math.max(1, Math.ceil(Math.sqrt(count)))
            readonly property int rowCount: Math.max(1, Math.ceil(count / columns))
            readonly property real cellWidth: (width - (columns - 1) * spacing) / columns
            readonly property real cellHeight: (height - (rowCount - 1) * spacing) / rowCount

            Repeater {
                model: grid.takes
                delegate: Rectangle {
                    id: cell
                    required property var modelData
                    objectName: "takeCell_" + modelData.key
                    width: cells.cellWidth
                    height: cells.cellHeight
                    radius: Ui.Metrics.radiusControl
                    color: Ui.Theme.surfacePanel
                    border.width: modelData.active ? Ui.Metrics.focus : Ui.Metrics.border
                    border.color: modelData.active ? Ui.Theme.accentPrimary
                        : press.containsMouse ? Ui.Theme.borderStrong : Ui.Theme.borderSubtle
                    Accessible.role: Accessible.Button
                    Accessible.name: cell.modelData.name + (cell.modelData.active ? ", current take" : "")
                    Accessible.onPressAction: grid.choose(cell.modelData.key, false)

                    FrameImage {
                        id: frameImage
                        objectName: "takeCellFrame"
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.bottom: nameRow.top
                        anchors.margins: cell.border.width
                        image: {
                            grid.framesRevision
                            return grid.frame(cell.modelData.id)
                        }
                    }
                    Ui.Text {
                        objectName: "takeCellNoFrame"
                        anchors.centerIn: frameImage
                        width: frameImage.width
                        horizontalAlignment: Text.AlignHCenter
                        elide: Text.ElideRight
                        visible: !cell.modelData.audio && grid.framesRevision >= 0 && grid.frame(cell.modelData.id).width === 0
                        text: "No preview yet"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.Icon {
                        anchors.centerIn: parent
                        visible: cell.modelData.audio
                        name: "audiotrack"
                        size: Ui.Metrics.iconLg
                        tone: Ui.Text.Secondary
                    }
                    Row {
                        id: nameRow
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.bottom: parent.bottom
                        anchors.margins: Ui.Metrics.xs
                        spacing: Ui.Metrics.xs
                        Ui.Text {
                            id: keyText
                            objectName: "takeCellKey"
                            anchors.verticalCenter: parent.verticalCenter
                            text: cell.modelData.key
                            role: Ui.Typography.MonoStrong
                            tone: cell.modelData.active ? Ui.Text.Primary : Ui.Text.Secondary
                        }
                        Ui.Text {
                            objectName: "takeCellName"
                            anchors.verticalCenter: parent.verticalCenter
                            width: nameRow.width - keyText.width - nameRow.spacing
                            text: cell.modelData.name
                            elide: Text.ElideRight
                            role: Ui.Typography.SansCaption
                            tone: cell.modelData.active ? Ui.Text.Primary : Ui.Text.Secondary
                        }
                    }
                    MouseArea {
                        id: press
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        acceptedButtons: Qt.LeftButton | Qt.RightButton
                        onClicked: event => {
                            if (event.button === Qt.RightButton) {
                                menu.number = cell.modelData.key
                                menu.popup()
                                return
                            }
                            grid.choose(cell.modelData.key, (event.modifiers & Qt.ControlModifier) !== 0)
                        }
                    }
                }
            }
        }
        Ui.ContextMenu {
            id: menu
            objectName: "takeCellMenu"
            property int number: 1
            Ui.MenuItem { text: "Switch to this take"; onTriggered: grid.choose(menu.number, false) }
            Ui.MenuItem { text: "Cut to this take at the playhead"; onTriggered: grid.choose(menu.number, true) }
        }
    }
}
