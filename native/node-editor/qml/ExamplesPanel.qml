pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The rail's Examples view (web/src/components/examples/ExamplesPanel.tsx),
// limited to workflow examples: the server's workflow and ComfyUI examples,
// and the examples bundled with the app. A card opens the example in a
// workflow tab. A server example opens as the account's own copy.
Rectangle {
    id: root
    required property ExampleGallery gallery
    // The tab's MediaResolver, which loads each card's preview image.
    property var resolver: null
    implicitWidth: Ui.Metrics.dialogCompactWidth
    color: Ui.Theme.surfacePanel

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.Text {
                objectName: "examples-title"
                Layout.fillWidth: true
                text: "Examples"
                role: Ui.Typography.SansLabel
            }
            Ui.ToolbarIconButton {
                objectName: "examples-refresh"
                visible: root.gallery.connected
                iconName: "refresh"
                accessibleName: "Refresh examples"
                description: accessibleName
                loading: root.gallery.loading
                onClicked: root.gallery.refresh()
            }
            Ui.CloseButton {
                objectName: "examples-close"
                accessibleName: "Close examples"
                description: accessibleName
                onClicked: root.gallery.close()
            }
        }
        Ui.TextField {
            id: search
            objectName: "examples-search"
            Layout.fillWidth: true
            placeholderText: "Search examples"
            accessibleName: placeholderText
            selectByMouse: true
            text: root.gallery.search
            onTextEdited: root.gallery.search = text
        }
        Flow {
            objectName: "examples-filters"
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Accessible.role: Accessible.Grouping
            Accessible.name: "Example types"
            Repeater {
                model: [{key: "all", label: "All"}].concat(root.gallery.groups.map(group => ({key: group.key, label: group.label})))
                Ui.EditorButton {
                    id: chip
                    required property var modelData
                    objectName: "examples-filter-" + chip.modelData.key
                    text: chip.modelData.label
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    active: root.gallery.filter === chip.modelData.key
                    onClicked: root.gallery.filter = chip.modelData.key
                }
            }
        }
        Ui.Banner {
            objectName: "examples-connect"
            visible: !root.gallery.connected && root.gallery.filter !== "builtin"
            Layout.fillWidth: true
            status: Ui.Status.Info
            message: "Connect to a server to see its workflow and ComfyUI examples."
            actionText: "Connect"
            onActionTriggered: root.gallery.connectServer()
        }
        Item {
            visible: root.visibleGroups.length === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            Ui.EmptyState {
                objectName: "examples-empty"
                anchors.centerIn: parent
                maxTextWidth: Math.min(parent.width, Ui.Metrics.dialogCompactWidth)
                title: "No matching examples"
                message: "Try a different search term."
                actionText: root.gallery.search !== "" ? "Clear search" : ""
                onActionTriggered: root.gallery.search = ""
            }
        }
        ListView {
            id: list
            objectName: "examples-list"
            // The narrowest card before the grid drops a column, as AutoGrid minItemWidth 128.
            readonly property real minCard: Ui.Metrics.xxl * 5
            readonly property real cardSpacing: Ui.Metrics.md
            readonly property int columns: Math.max(1, Math.floor((width + cardSpacing) / (minCard + cardSpacing)))
            readonly property real cardWidth: (width - cardSpacing * (columns - 1)) / columns
            onColumnsChanged: root.rebuild()
            visible: root.visibleGroups.length > 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: root.lines
            // A screen of cards builds ahead of the scroll, so previews load before they enter.
            cacheBuffer: Math.max(0, height)
            pixelAligned: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Loader {
                id: line
                required property var modelData
                width: list.width
                sourceComponent: modelData.kind === "header" ? headerLine : cardLine
            }
        }
    }

    // The list's lines: a header for each visible group, then its cards in
    // rows of list.columns. Rebuilt only when the list or the column count
    // changes, so a copy in progress keeps every card and its preview.
    property var visibleGroups: []
    property var lines: []
    function rebuild() {
        const groups = gallery.groups.filter(group =>
            (gallery.filter === "all" || gallery.filter === group.key)
            && (group.count > 0 || (gallery.search.trim() === "" && (group.loading || group.error !== ""))))
        const rows = gallery.rows
        const columns = list.columns
        const result = []
        for (const group of groups) {
            const entries = rows.filter(row => row.group === group.key)
            result.push({kind: "header", group: group, empty: entries.length === 0, last: entries.length === 0})
            for (let i = 0; i < entries.length; i += columns) {
                result.push({kind: "cards", entries: entries.slice(i, i + columns), last: i + columns >= entries.length})
            }
        }
        visibleGroups = groups
        lines = result
    }
    Component.onCompleted: rebuild()
    Connections {
        target: root.gallery
        function onListChanged() { root.rebuild() }
    }

    Component {
        id: headerLine
        Column {
            id: header
            readonly property var lineData: parent ? parent.modelData : ({})
            readonly property var group: lineData.group || ({})
            objectName: "examples-section-" + header.group.key
            spacing: Ui.Metrics.sm
            bottomPadding: header.lineData.last ? Ui.Metrics.lg : Ui.Metrics.sm
            Accessible.role: Accessible.Grouping
            Accessible.name: "Example " + header.group.label
            Ui.Text {
                text: header.group.label
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
            Ui.BusyIndicator {
                objectName: "examples-loading-" + header.group.key
                visible: header.group.loading && header.lineData.empty
                running: visible
                accessibleName: "Loading " + header.group.label
            }
            Ui.Banner {
                objectName: "examples-error-" + header.group.key
                visible: header.group.error !== ""
                width: list.width
                status: Ui.Status.Error
                message: header.group.error
                actionText: "Retry"
                onActionTriggered: root.gallery.refresh()
            }
        }
    }

    Component {
        id: cardLine
        Row {
            id: cardRow
            readonly property var lineData: parent ? parent.modelData : ({})
            readonly property real cardWidth: list.cardWidth
            spacing: list.cardSpacing
            bottomPadding: cardRow.lineData.last ? Ui.Metrics.lg : list.cardSpacing
            Repeater {
                model: cardRow.lineData.entries
                ExampleCard {}
            }
        }
    }

    // One example, a button whose content is the preview and the labels. The
    // list builds the card, and so loads its preview, near the view.
    component ExampleCard: Ui.EditorButton {
        id: card
        required property var modelData
        readonly property bool opening: root.gallery.openingKey === modelData.key
        readonly property bool busy: root.gallery.openingKey !== ""
        objectName: "example-card-" + modelData.key
        width: parent ? parent.cardWidth : 0
        height: implicitHeight
        text: modelData.name || "Untitled example"
        accessibleName: "Open example " + text
        description: modelData.secondary
        active: opening
        enabled: !busy || opening
        leftPadding: Ui.Metrics.none
        rightPadding: Ui.Metrics.none
        topPadding: Ui.Metrics.none
        bottomPadding: Ui.Metrics.none
        implicitHeight: content.implicitHeight
        onClicked: root.gallery.open(modelData.key)
        contentItem: ColumnLayout {
            id: content
            spacing: Ui.Metrics.none
            Ui.Surface {
                Layout.fillWidth: true
                Layout.preferredHeight: width * 9 / 16
                variant: Ui.Surface.Canvas
                clip: true
                Loader {
                    anchors.fill: parent
                    // The preview is decoration, so pointer and focus stay on the card.
                    enabled: false
                    active: card.modelData.thumbnail !== "" && root.resolver !== null
                    sourceComponent: Component {
                        MediaPreview {
                            mediaKind: "image"
                            locator: ({type: "image", uri: card.modelData.thumbnail})
                            resolver: root.resolver
                            requestKey: "example-thumbnail:" + card.modelData.key
                            showFilename: false
                            showDownload: false
                            fillPreview: true
                        }
                    }
                }
                Ui.Icon {
                    anchors.centerIn: parent
                    visible: card.modelData.thumbnail === "" || root.resolver === null
                    name: "accountTree"
                    tone: Ui.Text.Secondary
                    size: Ui.Metrics.iconLg
                }
                Ui.BusyIndicator {
                    anchors.centerIn: parent
                    visible: card.opening
                    running: card.opening
                    accessibleName: "Adding a copy"
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.margins: Ui.Metrics.sm
                spacing: Ui.Metrics.xs
                Ui.Text {
                    Layout.fillWidth: true
                    text: card.text
                    role: Ui.Typography.SansLabel
                    elide: Text.ElideRight
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: card.opening ? "Adding a copy…" : card.modelData.secondary
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
            }
        }
    }
}
