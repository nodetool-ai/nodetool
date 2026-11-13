pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The status bar's Generations view (web/src/components/panels/generations/
// GenerationsPanel.tsx): every image, video and audio generation of the
// account, running ones first, with All, Generating and Failed filters.
Rectangle {
    id: root
    required property GenerationActivity activity
    // The tab's MediaResolver, which loads each tile's image.
    property var resolver: null
    property string filter: "all"
    property double now: Date.now()
    readonly property var counts: activity.counts
    readonly property int finishedCount: counts.all - counts.generating
    // A filter whose last generation left the list falls back to everything.
    readonly property string activeFilter: counts[filter] > 0 ? filter : "all"
    readonly property var shown: activeFilter === "all" ? activity.rows : activity.rows.filter(row => row.status === activeFilter)
    signal closeRequested()
    implicitWidth: Ui.Metrics.dialogCompactWidth * 2
    implicitHeight: Ui.Metrics.touch * 8
    color: Ui.Theme.surfacePanel
    Component.onCompleted: activity.refresh()

    // formatPredictionElapsed in web/src/core/chat/mediaPrediction.ts.
    function elapsed(seconds) {
        if (seconds < 1) { return "0s" }
        if (seconds < 60) { return seconds + "s" }
        return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s"
    }
    // The tile's second line: where it was made, the model, then how long it took or when.
    function metaLine(row) {
        const parts = [row.source, row.model]
        if (row.status === "generating") {
            parts.push(elapsed(Math.max(0, Math.floor((now - row.startedAt) / 1000))))
        } else if (row.endedAt > 0) {
            parts.push(Qt.formatTime(new Date(row.endedAt), Qt.locale().timeFormat(Locale.ShortFormat)))
        }
        return parts.filter(part => !!part).join(" · ")
    }
    // StatusPill tones: generating, done, failed and stopped.
    function statusLabel(status) {
        return status === "generating" ? "generating" : status === "generated" ? "done" : status === "failed" ? "failed" : "stopped"
    }
    function kindIcon(kind) {
        return kind === "image" ? "image" : kind === "video" ? "movieOutlined" : kind === "audio" ? "audiotrack" : "autoAwesomeOutlined"
    }

    // One clock for every running tile, ticking only while one runs.
    Timer {
        interval: 1000
        repeat: true
        running: root.counts.generating > 0
        onTriggered: root.now = Date.now()
        onRunningChanged: if (running) root.now = Date.now()
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "generations-title"
                text: "Generations"
                role: Ui.Typography.SansLabel
            }
            Ui.Text {
                objectName: "generations-count"
                visible: root.counts.all > 0
                text: root.counts.all
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            Item { Layout.fillWidth: true }
            Ui.ToolbarIconButton {
                objectName: "generations-clear-finished"
                visible: root.finishedCount > 0
                iconName: "deleteOutline"
                accessibleName: "Clear finished"
                description: accessibleName
                onClicked: root.activity.clearFinished()
            }
            Ui.ToolbarIconButton {
                objectName: "generations-refresh"
                iconName: "refresh"
                accessibleName: "Refresh generations"
                description: accessibleName
                loading: root.activity.loading
                onClicked: root.activity.refresh()
            }
            Ui.CloseButton {
                objectName: "generations-close"
                accessibleName: "Close generations"
                description: accessibleName
                onClicked: root.closeRequested()
            }
        }
        Ui.Status {
            objectName: "generations-error"
            visible: root.activity.error !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: root.activity.error
            wrap: true
        }
        Item {
            visible: root.counts.all === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            Ui.EmptyState {
                objectName: "generations-empty"
                anchors.centerIn: parent
                maxTextWidth: Math.min(parent.width, Ui.Metrics.dialogCompactWidth)
                title: "No generations yet"
                message: "Images, video and audio you generate in any editor, guided flow, chat or workflow show here while they run."
            }
        }
        RowLayout {
            visible: root.counts.all > 0
            spacing: Ui.Metrics.xs
            Accessible.role: Accessible.Grouping
            Accessible.name: "Filter generations"
            Repeater {
                model: [{key: "all", label: "All"}, {key: "generating", label: "Generating"}, {key: "failed", label: "Failed"}]
                Ui.EditorButton {
                    id: chip
                    required property var modelData
                    objectName: "generations-filter-" + chip.modelData.key
                    visible: chip.modelData.key === "all" || root.counts[chip.modelData.key] > 0
                    text: chip.modelData.label + " " + root.counts[chip.modelData.key]
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    textTone: chip.modelData.key === "failed" ? Ui.Text.Error : Ui.Text.Primary
                    active: root.activeFilter === chip.modelData.key
                    onClicked: root.filter = chip.modelData.key
                }
            }
        }
        GridView {
            id: grid
            objectName: "generations-grid"
            visible: root.counts.all > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            // TILE_MIN_WIDTH: the narrowest tile before the grid drops a column.
            readonly property real minTile: Ui.Metrics.xxl * 7
            readonly property int columns: Math.max(1, Math.floor(width / minTile))
            cellWidth: width / columns
            cellHeight: (cellWidth - Ui.Metrics.sm) * 10 / 16 + Ui.Metrics.touch + Ui.Metrics.xl
            model: root.shown
            Accessible.role: Accessible.List
            Accessible.name: "Generations"
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.Surface {
                id: tile
                required property var modelData
                required property int index
                readonly property bool running: modelData.status === "generating"
                objectName: "generation-tile-" + modelData.id
                width: grid.cellWidth - Ui.Metrics.sm
                height: grid.cellHeight - Ui.Metrics.sm
                variant: Ui.Surface.Input
                selected: activeFocus
                color: hover.hovered && modelData.canOpenSource ? Ui.Theme.actionHover : Ui.Theme.surfaceOverlay
                activeFocusOnTab: modelData.canOpenSource
                Accessible.role: modelData.canOpenSource ? Accessible.Button : Accessible.ListItem
                Accessible.name: modelData.canOpenSource ? "Open " + (modelData.source || modelData.title) : modelData.title
                Keys.onReturnPressed: root.activity.openSource(modelData.id)
                Keys.onEnterPressed: root.activity.openSource(modelData.id)
                Keys.onSpacePressed: root.activity.openSource(modelData.id)
                HoverHandler { id: hover }
                MouseArea {
                    anchors.fill: parent
                    enabled: tile.modelData.canOpenSource
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        tile.forceActiveFocus()
                        root.activity.openSource(tile.modelData.id)
                    }
                }
                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: Ui.Metrics.xs
                    spacing: Ui.Metrics.xs
                    Ui.Surface {
                        id: thumb
                        Layout.fillWidth: true
                        Layout.preferredHeight: width * 10 / 16
                        variant: Ui.Surface.Canvas
                        clip: true
                        Loader {
                            anchors.fill: parent
                            active: tile.modelData.kind === "image" && tile.modelData.assetId !== ""
                            sourceComponent: Component {
                                MediaPreview {
                                    mediaKind: "image"
                                    locator: ({type: "image", asset_id: tile.modelData.assetId, uri: "asset://" + tile.modelData.assetId})
                                    resolver: root.resolver
                                    requestKey: "generation-tile:" + tile.modelData.id + ":" + String(tile)
                                    showFilename: false
                                    showDownload: false
                                    fillPreview: true
                                }
                            }
                        }
                        Ui.Icon {
                            objectName: "generation-icon-" + tile.modelData.id
                            anchors.centerIn: parent
                            visible: tile.modelData.kind !== "image" || tile.modelData.assetId === ""
                            name: tile.modelData.status === "failed" ? "error" : root.kindIcon(tile.modelData.kind)
                            tone: tile.modelData.status === "failed" ? Ui.Text.Error : Ui.Text.Secondary
                            size: Ui.Metrics.iconLg
                        }
                        Ui.Surface {
                            anchors.left: parent.left
                            anchors.top: parent.top
                            anchors.margins: Ui.Metrics.xs
                            width: pill.implicitWidth + Ui.Metrics.md * 2
                            height: pill.implicitHeight + Ui.Metrics.xs
                            radius: Ui.Metrics.radiusPill
                            variant: Ui.Surface.Overlay
                            Ui.Text {
                                id: pill
                                objectName: "generation-status-" + tile.modelData.id
                                anchors.centerIn: parent
                                text: root.statusLabel(tile.modelData.status)
                                role: Ui.Typography.SansCaption
                                tone: tile.modelData.status === "failed" ? Ui.Text.Error : tile.modelData.status === "generated" ? Ui.Text.Success : Ui.Text.Secondary
                            }
                        }
                        Ui.ToolbarIconButton {
                            objectName: "generation-open-workflow-" + tile.modelData.id
                            visible: tile.modelData.canOpenAsWorkflow
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.margins: Ui.Metrics.xs
                            iconName: "accountTree"
                            accessibleName: "Open as workflow"
                            description: accessibleName
                            onClicked: root.activity.openAsWorkflow(tile.modelData.id)
                        }
                        Ui.Progress {
                            visible: tile.running
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.bottom: parent.bottom
                            implicitHeight: Ui.Metrics.xs
                            indeterminate: true
                            accessibleName: "Generating"
                        }
                    }
                    Ui.Text {
                        objectName: "generation-title-" + tile.modelData.id
                        Layout.fillWidth: true
                        Layout.leftMargin: Ui.Metrics.micro
                        Layout.rightMargin: Ui.Metrics.micro
                        text: tile.modelData.title
                        textFormat: Text.PlainText
                        role: Ui.Typography.SansLabel
                        elide: Text.ElideRight
                    }
                    Ui.Text {
                        objectName: "generation-meta-" + tile.modelData.id
                        Layout.fillWidth: true
                        Layout.leftMargin: Ui.Metrics.micro
                        Layout.rightMargin: Ui.Metrics.micro
                        readonly property bool failed: tile.modelData.status === "failed" && tile.modelData.error !== ""
                        text: failed ? tile.modelData.error : root.metaLine(tile.modelData)
                        textFormat: Text.PlainText
                        role: Ui.Typography.SansCaption
                        tone: failed ? Ui.Text.Error : Ui.Text.Secondary
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
