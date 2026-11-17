pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Files

// The project's Files view (the web WorkspaceTree.tsx):
// the tree of the project folder as one virtualized list of its visible rows.
// The rows, their order and their kinds come from ProjectFiles. A delegate
// only draws its row.
Rectangle {
    id: root
    required property ProjectFiles files
    // A host whose dock has its own close control hides the panel's button.
    property bool closable: true
    signal closeRequested()
    readonly property real rowHeight: Ui.Metrics.compact
    readonly property real thumbSize: Ui.Metrics.small
    readonly property real indent: Ui.Metrics.lg
    // The media area of the preview, as the web FILE_PREVIEW_HEIGHT (168px).
    readonly property real previewHeight: Ui.Metrics.xxl * 7
    property bool previewExpanded: true
    // The host's player for a video, audio or 3D model selection. The Files
    // module has no player of its own. The loaded item gets two properties,
    // `source` (url, the file's previewMediaUrl) and `kind` ("video", "audio"
    // or "model3d"), and fills the media area. Without a delegate, or for a
    // kind the delegate cannot show, the area shows the file's glyph.
    property Component previewDelegate: null
    // The kinds the host's delegate plays.
    property var previewDelegateKinds: ["video", "audio"]
    readonly property bool previewPlayable: previewDelegate !== null
        && previewDelegateKinds.indexOf(files.previewKind) >= 0
        && files.previewMediaUrl.toString() !== ""
    implicitWidth: Ui.Metrics.panelWidth
    color: Ui.Theme.surfacePanel

    // A drop on the list (the web WorkspaceTree.tsx handleDrop): a row of this
    // tree moves into the directory under the drop, and files from the OS are
    // copied into it. `row` is -1 below the last row, which is the root.
    readonly property string entryMime: "application/x-nodetool-project-entry"
    // The list row under a point of the panel, or -1.
    function rowAt(x: real, y: real): int {
        const point = list.mapFromItem(root, x, y)
        if (!list.visible || !list.contains(point)) return -1
        return list.indexAt(point.x + list.contentX, point.y + list.contentY)
    }
    function dropOn(row: int, entryPath: string, urls: var): bool {
        const directory = files.dropDirectory(row)
        if (entryPath !== "") return files.moveEntry(entryPath, directory)
        return files.copyIn(urls, directory) > 0
    }

    function openMenu(path: string, item: Item, x: real, y: real) {
        menu.path = path
        menu.returnFocusTo = list
        const point = item.mapToItem(root, x, y)
        menu.popup(root, point.x, point.y)
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        Ui.PanelHeader {
            objectName: "files-header"
            Layout.fillWidth: true
            text: "Files"
            Ui.ToolbarIconButton {
                objectName: "files-refresh"
                visible: root.files.hasFolder
                iconName: "refresh"
                accessibleName: "Refresh files"
                description: accessibleName
                loading: root.files.busy
                onClicked: root.files.refresh()
            }
            Ui.CloseButton {
                objectName: "files-close"
                visible: root.closable
                accessibleName: "Close files"
                description: accessibleName
                onClicked: root.closeRequested()
            }
        }
        Item {
            objectName: "files-state"
            visible: list.count === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            Ui.BusyIndicator {
                objectName: "files-loading"
                anchors.centerIn: parent
                visible: root.files.loading
                running: visible
            }
            Ui.EmptyState {
                objectName: "files-no-folder"
                anchors.centerIn: parent
                visible: !root.files.hasFolder
                maxTextWidth: Math.min(parent.width, Ui.Metrics.panelWidth)
                title: "No project folder"
                message: "This project has no folder yet."
            }
            Ui.EmptyState {
                objectName: "files-empty"
                anchors.centerIn: parent
                visible: root.files.hasFolder && root.files.empty
                maxTextWidth: Math.min(parent.width, Ui.Metrics.panelWidth)
                title: "Project folder is empty"
                message: "Add files to the project folder to see them here."
            }
            Ui.EmptyState {
                objectName: "files-error"
                anchors.centerIn: parent
                visible: root.files.hasFolder && root.files.error !== ""
                maxTextWidth: Math.min(parent.width, Ui.Metrics.panelWidth)
                title: "The project folder was not listed"
                message: root.files.error
                actionText: "Try again"
                onActionTriggered: root.files.refresh()
            }
        }
        ListView {
            id: list
            objectName: "files-list"
            visible: count > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.files
            focus: true
            activeFocusOnTab: true
            Accessible.role: Accessible.Tree
            Accessible.name: "Project files"
            // Rows have one height, so the view lays out a 5,000-row folder
            // without measuring it, and builds only what is near the viewport.
            cacheBuffer: root.rowHeight * 4
            reuseItems: true
            pixelAligned: true
            boundsBehavior: Flickable.StopAtBounds
            // The view gives its current row the focus, so it follows the selection.
            keyNavigationEnabled: false
            currentIndex: root.files.selectedRow
            highlightFollowsCurrentItem: false
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            Keys.onUpPressed: root.files.moveSelection(-1)
            Keys.onDownPressed: root.files.moveSelection(1)
            Keys.onRightPressed: root.files.expandSelected()
            Keys.onLeftPressed: root.files.collapseSelected()
            Keys.onReturnPressed: root.files.activate(root.files.selectedRow)
            Keys.onEnterPressed: root.files.activate(root.files.selectedRow)
            Connections {
                target: root.files
                function onSelectionChanged() {
                    if (root.files.selectedRow >= 0) { list.positionViewAtIndex(root.files.selectedRow, ListView.Contain) }
                }
            }
            delegate: Ui.ListRow {
                id: row
                required property int index
                required property string path
                required property string name
                required property int depth
                required property bool isDir
                required property bool expanded
                required property bool placeholder
                required property string kind
                required property string iconName
                required property url thumbnailUrl
                required property bool selected
                objectName: "files-row"
                // A pooled row waits for reuse off screen.
                property bool pooled: false
                ListView.onPooled: pooled = true
                ListView.onReused: pooled = false
                width: ListView.view.width
                height: root.rowHeight
                flat: true
                focusPolicy: Qt.NoFocus
                active: row.selected
                enabled: !row.placeholder
                accessibleName: row.name
                onClicked: {
                    list.forceActiveFocus()
                    root.files.click(row.index)
                }
                onDoubleClicked: root.files.activate(row.index)
                // The focused row takes Enter, which opens a file, not the click that toggles.
                Keys.onReturnPressed: root.files.activate(row.index)
                Keys.onEnterPressed: root.files.activate(row.index)
                // Drag a row onto a folder to move it, or a media file onto
                // the workflow canvas to add its constant node.
                // The mime data is built when a drag starts, not for every row.
                Drag.dragType: Drag.Automatic
                Drag.supportedActions: Qt.CopyAction | Qt.MoveAction
                Drag.proposedAction: Qt.MoveAction
                DragHandler {
                    id: rowDrag
                    objectName: "files-row-drag"
                    target: null
                    enabled: !row.placeholder
                    onActiveChanged: {
                        if (active) row.Drag.mimeData = root.files.dragData(row.index)
                        row.Drag.active = active
                    }
                }
                TapHandler {
                    acceptedButtons: Qt.RightButton
                    enabled: root.files.revealable
                    onTapped: eventPoint => {
                        root.files.select(row.index)
                        root.openMenu(row.path, row, eventPoint.position.x, eventPoint.position.y)
                    }
                }
                Ui.Icon {
                    objectName: "files-chevron"
                    x: Ui.Metrics.xs + row.depth * root.indent
                    anchors.verticalCenter: parent.verticalCenter
                    visible: row.isDir
                    name: "chevronRight"
                    size: Ui.Metrics.iconXs
                    rotation: row.expanded ? 90 : 0
                }
                Ui.Icon {
                    id: kindIcon
                    objectName: "files-kind-icon"
                    x: Ui.Metrics.xs + row.depth * root.indent + Ui.Metrics.iconXs + Ui.Metrics.xs + (root.thumbSize - width) / 2
                    anchors.verticalCenter: parent.verticalCenter
                    visible: row.iconName !== "" && thumb.status !== Image.Ready
                    name: row.iconName
                    tone: row.kind === "error" ? Ui.Text.Warning : row.isDir ? Ui.Text.Info : Ui.Text.Secondary
                }
                Image {
                    id: thumb
                    objectName: "files-thumbnail"
                    x: Ui.Metrics.xs + row.depth * root.indent + Ui.Metrics.iconXs + Ui.Metrics.xs
                    anchors.verticalCenter: parent.verticalCenter
                    width: root.thumbSize
                    height: root.thumbSize
                    visible: status === Image.Ready
                    asynchronous: true
                    cache: true
                    smooth: true
                    fillMode: Image.PreserveAspectCrop
                    sourceSize: Qt.size(Math.ceil(root.thumbSize * Screen.devicePixelRatio), Math.ceil(root.thumbSize * Screen.devicePixelRatio))
                    source: row.thumbnailUrl
                }
                Ui.Text {
                    objectName: "files-name"
                    x: thumb.x + root.thumbSize + Ui.Metrics.sm
                    width: Math.max(0, row.width - x - Ui.Metrics.xs)
                    anchors.verticalCenter: parent.verticalCenter
                    text: row.name
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansLabel
                    weight: row.isDir ? Font.Medium : Font.Normal
                    tone: row.kind === "error" ? Ui.Text.Warning : row.placeholder ? Ui.Text.Secondary : Ui.Text.Primary
                    tight: true
                    elide: Text.ElideRight
                }
            }
        }
        // The selected file at a glance (the web WorkspaceFilePreview.tsx).
        // Hidden when the selection has nothing to preview. An image loads a
        // picture, decoded off the UI thread at the area's size. Video and
        // audio play in the host's previewDelegate. Other kinds show their glyph.
        Ui.Separator {
            visible: preview.visible
            Layout.fillWidth: true
        }
        Ui.InspectorSection {
            id: preview
            objectName: "files-preview"
            visible: root.files.previewKind !== ""
            Layout.fillWidth: true
            title: "Preview"
            expanded: root.previewExpanded
            onExpansionRequested: next => root.previewExpanded = next
            Rectangle {
                objectName: "files-preview-media"
                width: preview.width
                height: root.previewHeight
                radius: Ui.Metrics.radiusControl
                color: Ui.Theme.surfaceCanvas
                clip: true
                Ui.Icon {
                    objectName: "files-preview-glyph"
                    anchors.centerIn: parent
                    visible: previewImage.status !== Image.Ready && !previewPlayer.active
                    name: root.files.previewIcon
                    size: Ui.Metrics.xxxl
                }
                Image {
                    id: previewImage
                    objectName: "files-preview-image"
                    anchors.fill: parent
                    visible: status === Image.Ready
                    asynchronous: true
                    cache: true
                    smooth: true
                    fillMode: Image.PreserveAspectFit
                    sourceSize: Qt.size(Math.ceil(width * Screen.devicePixelRatio), Math.ceil(height * Screen.devicePixelRatio))
                    source: root.files.previewImageUrl
                }
                Loader {
                    id: previewPlayer
                    objectName: "files-preview-player"
                    anchors.fill: parent
                    anchors.margins: Ui.Metrics.xs
                    active: root.previewPlayable && preview.expanded
                    sourceComponent: root.previewDelegate
                    onLoaded: {
                        item.source = Qt.binding(() => root.files.previewMediaUrl)
                        item.kind = Qt.binding(() => root.files.previewKind)
                    }
                }
            }
            // Name and details read as one block, closer than the gap to the media.
            Column {
                objectName: "files-preview-text"
                width: preview.width
                spacing: 0
                Ui.Text {
                    objectName: "files-preview-name"
                    width: preview.width
                    text: root.files.previewName
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Primary
                    elide: Text.ElideMiddle
                }
                Ui.Text {
                    objectName: "files-preview-details"
                    width: preview.width
                    text: root.files.previewDetails
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
                Ui.Text {
                    objectName: "files-preview-summary"
                    width: preview.width
                    visible: text !== ""
                    text: root.files.previewSummary
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
            }
        }
    }

    // The drop target of a move or a copy in from the OS: the whole panel.
    DropArea {
        id: panelDrop
        objectName: "files-drop-area"
        anchors.fill: parent
        enabled: root.files.hasFolder
        onEntered: drag => {
            const entry = drag.formats.indexOf(root.entryMime) >= 0
            if (!entry && !drag.hasUrls) { drag.accepted = false; return }
            drag.accept(entry ? Qt.MoveAction : Qt.CopyAction)
        }
        onDropped: drop => {
            const entry = drop.formats.indexOf(root.entryMime) >= 0 ? drop.getDataAsString(root.entryMime) : ""
            if (root.dropOn(root.rowAt(drop.x, drop.y), entry, drop.hasUrls ? drop.urls : []))
                drop.accept(entry !== "" ? Qt.MoveAction : Qt.CopyAction)
        }
        Rectangle {
            objectName: "files-drop-highlight"
            anchors.fill: parent
            visible: panelDrop.containsDrag
            color: "transparent"
            radius: Ui.Metrics.radiusControl
            border.color: Ui.Theme.accentPrimary
            border.width: Ui.Metrics.border
        }
    }

    Ui.ContextMenu {
        id: menu
        objectName: "files-menu"
        property string path: ""
        Ui.MenuItem {
            objectName: "files-reveal"
            text: root.files.revealLabel
            onTriggered: root.files.reveal(menu.path)
        }
    }
}
