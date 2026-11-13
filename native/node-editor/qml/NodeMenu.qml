pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The web node menu (components/node_menu/NodeMenu.tsx, NamespaceList.tsx): a
// floating panel with a search field, a namespace tree, the node rows and the
// hovered node's details. With no search and no namespace it shows the
// favorite, recent and quick-action tiles. The type and provider filters of the
// web menu are not part of this panel yet.
Rectangle {
    id: root
    EditorRoles { id: roles }
    required property NodeCatalog catalog
    required property PackSetup packSetup
    color: Ui.Theme.surfaceOverlay
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    property string query: ""
    // The selected namespace path, such as ["nodetool", "image"]. Empty shows the home tiles.
    property var selectedPath: []
    property var hovered: null
    readonly property string selectedPathString: selectedPath.join(".")
    readonly property bool searching: query.trim() !== ""
    readonly property bool homeLayout: nodes.length > 0 && !searching && selectedPath.length === 0

    function focusSearch() {
        search.forceActiveFocus(Qt.OtherFocusReason)
    }
    // NodeMenuStore.openNodeMenu starts each opening with an empty search at the home view.
    function reset() {
        search.text = ""
        query = ""
        selectedPath = []
        hovered = null
        highlighted = -1
    }
    function close() {
        root.catalog.closeMenu()
    }
    // NodeInfoPanel.tsx opens the menu at a node's namespace or searching one of its tags.
    function showPath(path, term) {
        search.text = term
        query = term
        selectedPath = Array.from(path)
    }

    readonly property var nodes: root.catalog.nodes
    // Nodes whose provider key is missing stay out unless the user shows them
    // (web hooks/useNodeProviderFilter.ts), as in the node library.
    readonly property var configuredKeys: root.packSetup.configuredKeys
    readonly property bool keyFilterActive: root.packSetup.secretsLoaded
    readonly property bool showWithoutKey: root.packSetup.showNodesWithoutKey
    readonly property var listedNodes: showWithoutKey ? nodes : nodes.filter(node => !(keyFilterActive && !!node.keyGate && !configuredKeys.includes(node.keyGate)))
    // Optional packs that are off hide their nodes. A search still finds them.
    readonly property var browsable: {
        const optionalCategories = root.packSetup.categories
        return listedNodes.filter(node => root.packSetup.namespaceVisible(node.namespace))
    }
    function inPath(node, path) {
        const prefix = path.join(".")
        return prefix === "" || node.namespace === prefix || node.namespace.startsWith(prefix + ".")
    }

    // The namespace tree of useNamespaceTree.ts: one level for each dot, local providers first.
    readonly property var namespaceTree: {
        const tree = {}
        for (const node of browsable) {
            let level = tree
            for (const part of node.namespace.split(".")) {
                if (!level[part]) {
                    level[part] = { children: {}, local: false }
                }
                level[part].local = level[part].local || node.provider === "local"
                level = level[part].children
            }
        }
        return tree
    }
    // The namespaces that hold a search match, as RenderNamespaces.tsx highlights them.
    readonly property var matchingNamespaces: {
        const matching = new Set()
        if (searching) {
            for (const node of searchMatches) {
                const parts = node.namespace.split(".")
                for (let i = 1; i <= parts.length; ++i) {
                    matching.add(parts.slice(0, i).join("."))
                }
            }
        }
        return matching
    }
    // The tree as rows. A level below the top shows while its parent is on the selected path.
    readonly property var namespaceRows: {
        const rows = []
        const selected = selectedPath
        const visit = (level, path) => {
            const keys = Object.keys(level).sort((a, b) => {
                if (level[a].local !== level[b].local) {
                    return level[a].local ? -1 : 1
                }
                return a.localeCompare(b)
            })
            for (const key of keys) {
                const full = path.concat([key])
                const fullString = full.join(".")
                const hasChildren = Object.keys(level[key].children).length > 0
                const open = selected.length >= full.length && selected[full.length - 1] === key
                    && full.every((part, index) => selected[index] === part)
                rows.push({
                    name: key,
                    path: full,
                    depth: path.length,
                    hasChildren: hasChildren,
                    expanded: open,
                    selected: fullString === root.selectedPathString,
                    highlighted: root.matchingNamespaces.has(fullString)
                })
                if (open && hasChildren) {
                    visit(level[key].children, full)
                }
            }
        }
        visit(namespaceTree, [])
        return rows
    }
    function selectPath(path) {
        // A second click on the selected namespace clears it (NamespaceItem.tsx handleClick).
        selectedPath = path.join(".") === selectedPathString ? path.slice(0, -1) : path
        highlighted = -1
    }

    // The search order of the node library (utils/nodeSearch.ts rankSearchNodes),
    // ranked in src/graph/CatalogSearch.cpp. A search covers every listed node.
    readonly property var recentTypes: root.catalog.recent
    readonly property var searchMatches: {
        if (!searching) {
            return []
        }
        void recentTypes
        return root.catalog.rank(listedNodes, query).map(index => listedNodes[index])
    }
    readonly property var visibleNodes: {
        if (searching) {
            return selectedPath.length === 0 ? searchMatches : searchMatches.filter(node => inPath(node, selectedPath))
        }
        if (selectedPath.length === 0) {
            return []
        }
        void recentTypes
        const listed = browsable.filter(node => inPath(node, selectedPath))
        return root.catalog.rank(listed, "").map(index => listed[index])
    }
    // NamespaceList.tsx InfoBox buildContextMessage.
    readonly property string infoText: {
        if (homeLayout) {
            return ""
        }
        if (searching) {
            return selectedPathString !== ""
                ? qsTr("%1 results in %2 • %3 total match '%4'").arg(visibleNodes.length).arg(selectedPathString).arg(searchMatches.length).arg(query.trim())
                : qsTr("%1 results • Showing most relevant for '%2'").arg(visibleNodes.length).arg(query.trim())
        }
        return qsTr("%1 nodes in %2").arg(visibleNodes.length).arg(selectedPathString)
    }

    // ui_primitives/HighlightText.tsx: each case-insensitive match of the whole
    // search text shows in the primary color at weight 600.
    function escapeMarkup(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
    function highlight(text) {
        const value = text || ""
        const needle = query.trim().toLowerCase()
        if (needle === "") {
            return escapeMarkup(value)
        }
        const lower = value.toLowerCase()
        const color = Ui.Theme.accentPrimary.toString()
        let out = ""
        let from = 0
        for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
            out += escapeMarkup(value.slice(from, at)) + "<font color=\"" + color + "\"><b>"
                + escapeMarkup(value.slice(at, at + needle.length)) + "</b></font>"
            from = at + needle.length
        }
        return out + escapeMarkup(value.slice(from))
    }

    // The row the arrow keys picked. Enter adds it (stores/NodeMenuStore.ts moveSelectionUp/Down).
    property int highlighted: -1
    onQueryChanged: highlighted = -1
    function moveHighlight(delta) {
        const count = homeLayout ? 0 : visibleNodes.length
        if (count === 0) {
            highlighted = -1
            return
        }
        if (delta > 0) {
            highlighted = highlighted < 0 ? 0 : (highlighted + 1) % count
        } else {
            highlighted = highlighted <= 0 ? count - 1 : highlighted - 1
        }
        rows.positionViewAtIndex(highlighted, ListView.Contain)
    }
    function addHighlighted() {
        if (highlighted < 0 || highlighted >= visibleNodes.length || root.catalog.readOnly) {
            return false
        }
        root.catalog.add(visibleNodes[highlighted].type)
        return true
    }

    readonly property var quickActions: root.catalog.quickActions
    readonly property var favoriteTypes: root.catalog.favorites
    readonly property var quickActionTypeList: {
        const types = []
        for (const section of quickActions) {
            for (const tile of section.tiles) {
                types.push(tile.type)
            }
        }
        return types
    }
    readonly property var nodeIndex: {
        const index = {}
        for (const node of nodes) {
            index[node.type] = node
        }
        return index
    }
    // Recent nodes that are not quick actions (RecentNodesTiles.tsx filteredRecentNodes).
    readonly property var recentTiles: recentTypes.filter(type => !quickActionTypeList.includes(type))
    function tileLabel(type) {
        const node = nodeIndex[type]
        return node ? node.label : type.split(".").pop()
    }

    // A tile of the menu home: the node's type icon and its label (QuickActionTiles.tsx,
    // FavoritesTiles.tsx, RecentNodesTiles.tsx). A node that the catalog lacks stays but cannot add.
    component Tile: PanelRow {
        id: tile
        required property string tileType
        required property string tileLabel
        property bool removable: false
        readonly property var node: root.nodeIndex[tileType]
        signal removed()
        implicitHeight: Ui.Metrics.compact
        height: Ui.Metrics.compact
        text: tileLabel
        enabled: !!node && !root.catalog.readOnly
        onClicked: root.catalog.add(tileType)
        DragHandler {
            target: null
            onActiveChanged: if (active && tile.node) root.catalog.drag(tile.tileType)
        }
        onHoveredChanged: if (node) root.hovered = hovered ? node : null
        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: Ui.Metrics.sm
            anchors.rightMargin: Ui.Metrics.xs
            spacing: Ui.Metrics.sm
            TypeIcon {
                name: tile.node ? tile.node.icon : "notype"
                size: Ui.Metrics.iconSm
                ink: tile.node ? tile.node.color : Ui.Theme.textDisabled
            }
            Ui.Text {
                Layout.fillWidth: true
                text: tile.tileLabel
                role: Ui.Typography.SansLabel
                font.weight: Font.Normal
                tone: tile.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                elide: Text.ElideRight
                lineHeight: 1
            }
            Ui.ToolbarIconButton {
                visible: tile.removable
                objectName: "catalog-favorite-remove-" + tile.tileType
                iconName: "close"
                iconSize: Ui.Metrics.iconXs
                implicitWidth: Ui.Metrics.small
                implicitHeight: Ui.Metrics.small
                accessibleName: qsTr("Remove %1 from favorites").arg(tile.tileLabel)
                onClicked: tile.removed()
            }
        }
    }
    // A titled grid of tiles, with an optional clear button.
    component TileSection: ColumnLayout {
        id: section
        property string title: ""
        property var tiles: []
        property string tilePrefix: "catalog-tile-"
        property string clearName: ""
        property string clearLabel: ""
        property bool removable: false
        signal cleared()
        signal removed(string type)
        spacing: Ui.Metrics.xs
        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.md
            Ui.Text {
                Layout.fillWidth: true
                text: section.title
                role: Ui.Typography.SansLabel
                font.weight: Font.DemiBold
                lineHeight: 1
            }
            Ui.ToolbarIconButton {
                visible: section.clearName !== ""
                objectName: section.clearName
                iconName: "close"
                iconSize: Ui.Metrics.iconXs
                implicitWidth: Ui.Metrics.small
                implicitHeight: Ui.Metrics.small
                accessibleName: section.clearLabel
                onClicked: section.cleared()
            }
        }
        Flow {
            id: flow
            Layout.fillWidth: true
            Layout.preferredHeight: implicitHeight
            spacing: Ui.Metrics.xs
            readonly property int columns: Math.max(1, Math.floor(width / 140))
            Repeater {
                model: section.tiles
                delegate: Tile {
                    required property var modelData
                    objectName: section.tilePrefix + modelData.type
                    tileType: modelData.type
                    tileLabel: modelData.label
                    removable: section.removable
                    width: Math.floor((flow.width - (flow.columns - 1) * flow.spacing) / flow.columns)
                    onRemoved: section.removed(modelData.type)
                }
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        spacing: 0
        // The draggable header (NodeMenu.tsx .draggable-header).
        Item {
            objectName: "node-menu-header"
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.xxxl
            DragHandler {
                id: headerDrag
                target: null
                property point last
                onActiveChanged: if (active) last = centroid.scenePosition
                onCentroidChanged: {
                    if (!active) {
                        return
                    }
                    const point = centroid.scenePosition
                    root.catalog.moveMenu(point.x - last.x, point.y - last.y)
                }
            }
            HoverHandler { cursorShape: headerDrag.active ? Qt.ClosedHandCursor : Qt.OpenHandCursor }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: Ui.Metrics.lg
                anchors.rightMargin: Ui.Metrics.sm
                spacing: Ui.Metrics.sm
                Ui.Text { text: qsTr("Nodes"); role: Ui.Typography.SansLabel; font.weight: Font.DemiBold; lineHeight: 1 }
                Ui.Text { objectName: "catalog-count"; text: root.homeLayout ? root.browsable.length : root.visibleNodes.length; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
                Item { Layout.fillWidth: true }
                Ui.ToolbarIconButton {
                    objectName: "node-menu-close"
                    iconName: "close"
                    iconSize: Ui.Metrics.iconXs
                    implicitWidth: Ui.Metrics.small
                    implicitHeight: Ui.Metrics.small
                    accessibleName: qsTr("Close the node menu")
                    onClicked: root.close()
                }
            }
        }
        Ui.TextField {
            id: search
            objectName: "nodeSearch"
            accessibleName: "Search nodes"
            placeholderText: "Search nodes"
            density: Ui.EditorButton.Compact
            Layout.preferredWidth: Math.min(360, root.width - 2 * Ui.Metrics.lg)
            Layout.leftMargin: Ui.Metrics.lg
            Layout.bottomMargin: Ui.Metrics.sm
            leftPadding: Ui.Metrics.xxl + Ui.Metrics.micro
            background: Rectangle {
                color: roles.field
                radius: Ui.Metrics.radiusControl
                border.width: search.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
                border.color: search.activeFocus ? Ui.Theme.borderFocus : roles.divider
            }
            onValuePreviewed: value => root.query = value
            onValueCommitted: value => root.query = value
            onEditCanceled: root.query = value
            // Arrows pick a row, Enter adds it, Ctrl+Backspace clears, and Escape or
            // Space in an empty search closes the menu (web components/search/SearchInput.tsx).
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Down) {
                    root.moveHighlight(1)
                    event.accepted = true
                } else if (event.key === Qt.Key_Up) {
                    root.moveHighlight(-1)
                    event.accepted = true
                } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && root.highlighted >= 0) {
                    root.addHighlighted()
                    event.accepted = true
                } else if ((event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete) && (event.modifiers & Qt.ControlModifier)) {
                    search.text = ""
                    root.query = ""
                    event.accepted = true
                } else if ((event.key === Qt.Key_Space && search.text === "") || event.key === Qt.Key_Escape) {
                    root.close()
                    event.accepted = true
                }
            }
            TypeIcon { x: Ui.Metrics.sm; anchors.verticalCenter: parent.verticalCenter; name: "search"; size: Ui.Metrics.iconSm }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            // NamespacePanel.tsx: the namespace tree, 200 px wide.
            ListView {
                id: namespaces
                objectName: "node-menu-namespaces"
                Layout.preferredWidth: 200
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.xs
                visible: root.nodes.length > 0
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                model: root.namespaceRows
                delegate: PanelRow {
                    id: namespaceRow
                    required property var modelData
                    objectName: "node-menu-namespace-" + modelData.path.join(".")
                    x: Ui.Metrics.xs
                    width: ListView.view.width - Ui.Metrics.md
                    height: Ui.Metrics.compact
                    implicitHeight: Ui.Metrics.compact
                    text: modelData.name
                    active: modelData.selected
                    onClicked: root.selectPath(modelData.path)
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.sm + namespaceRow.modelData.depth * Ui.Metrics.md
                        anchors.rightMargin: Ui.Metrics.xs
                        spacing: Ui.Metrics.xs
                        Ui.Icon {
                            name: namespaceRow.modelData.hasChildren ? (namespaceRow.modelData.expanded ? "expandMore" : "navigateNext") : "navigateNext"
                            size: Ui.Metrics.iconXs
                            tone: Ui.Text.Secondary
                            opacity: namespaceRow.modelData.hasChildren ? 1 : 0
                        }
                        Ui.Text {
                            Layout.fillWidth: true
                            text: namespaceRow.modelData.name
                            role: Ui.Typography.SansLabel
                            font.weight: namespaceRow.modelData.highlighted ? Font.DemiBold : Font.Normal
                            tone: namespaceRow.modelData.selected || namespaceRow.modelData.highlighted ? Ui.Text.Primary : Ui.Text.Secondary
                            elide: Text.ElideRight
                            lineHeight: 1
                        }
                    }
                }
            }
            Rectangle { Layout.fillHeight: true; Layout.preferredWidth: Ui.Metrics.border; color: roles.divider; visible: namespaces.visible }
            Flickable {
                id: home
                objectName: "catalog-home"
                visible: root.homeLayout
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.sm
                clip: true
                contentWidth: width
                contentHeight: homeColumn.implicitHeight
                boundsBehavior: Flickable.StopAtBounds
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                ColumnLayout {
                    id: homeColumn
                    width: home.width - Ui.Metrics.md
                    x: Ui.Metrics.xs
                    spacing: Ui.Metrics.lg
                    TileSection {
                        objectName: "catalog-favorites"
                        Layout.fillWidth: true
                        visible: root.favoriteTypes.length > 0
                        title: qsTr("Favorites")
                        tilePrefix: "catalog-favorite-tile-"
                        tiles: root.favoriteTypes.map(type => ({ type: type, label: root.tileLabel(type) }))
                        removable: true
                        clearName: "catalog-favorites-clear"
                        clearLabel: qsTr("Clear all favorites")
                        onCleared: root.catalog.clearFavorites()
                        onRemoved: type => root.catalog.toggleFavorite(type)
                    }
                    TileSection {
                        objectName: "catalog-recent"
                        Layout.fillWidth: true
                        visible: root.recentTiles.length > 0
                        title: qsTr("Recent nodes")
                        tilePrefix: "catalog-recent-tile-"
                        tiles: root.recentTiles.map(type => ({ type: type, label: root.tileLabel(type) }))
                        clearName: "catalog-recent-clear"
                        clearLabel: qsTr("Clear recent nodes")
                        onCleared: root.catalog.clearRecent()
                    }
                    Repeater {
                        model: root.quickActions
                        delegate: TileSection {
                            required property var modelData
                            Layout.fillWidth: true
                            title: qsTr(modelData.title)
                            tiles: modelData.tiles
                        }
                    }
                }
            }
            ListView {
                id: rows
                objectName: "catalog-rows"
                visible: !root.homeLayout
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.xs
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                model: root.visibleNodes
                delegate: PanelRow {
                    id: nodeRow
                    required property var modelData
                    required property int index
                    active: index === root.highlighted
                    x: Ui.Metrics.xs
                    width: ListView.view.width - Ui.Metrics.md
                    // A search result also shows its description (SearchResultItem.tsx).
                    height: root.searching ? 54 : 40
                    implicitHeight: height
                    text: modelData.label
                    enabled: !root.catalog.readOnly
                    objectName: "catalog-node-" + modelData.type
                    onClicked: root.catalog.add(modelData.type)
                    DragHandler {
                        objectName: "catalog-drag-" + nodeRow.modelData.type
                        target: null
                        onActiveChanged: if (active) root.catalog.drag(nodeRow.modelData.type)
                    }
                    onHoveredChanged: if (hovered) root.hovered = modelData
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.xs
                        anchors.rightMargin: Ui.Metrics.xs
                        spacing: Ui.Metrics.xs
                        Rectangle {
                            Layout.preferredWidth: 22; Layout.preferredHeight: 22
                            Layout.leftMargin: Ui.Metrics.micro; Layout.rightMargin: Ui.Metrics.micro
                            radius: Ui.Metrics.radiusControl
                            color: Qt.rgba(rowIcon.ink.r, rowIcon.ink.g, rowIcon.ink.b, 0.08)
                            border.width: Ui.Metrics.border
                            border.color: Qt.rgba(rowIcon.ink.r, rowIcon.ink.g, rowIcon.ink.b, 0.14)
                            TypeIcon { id: rowIcon; anchors.centerIn: parent; name: nodeRow.modelData.icon; size: Ui.Metrics.iconXs; ink: nodeRow.modelData.color }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { objectName: "nativeButtonLabel"; Layout.fillWidth: true; textFormat: Text.StyledText; text: root.highlight(nodeRow.modelData.label); role: Ui.Typography.SansLabel; font.weight: Font.Normal; elide: Text.ElideRight; lineHeight: 1 }
                            Ui.Text { objectName: "node-menu-row-namespace"; Layout.fillWidth: true; textFormat: Text.StyledText; text: root.highlight(nodeRow.modelData.namespace); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight; lineHeight: 1 }
                            Ui.Text {
                                objectName: "node-menu-row-description"
                                visible: root.searching
                                Layout.fillWidth: true
                                textFormat: Text.StyledText
                                // The first line of the description, as the web caption shows it.
                                text: root.highlight((nodeRow.modelData.description || "").split("\n")[0])
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                                elide: Text.ElideRight
                                maximumLineCount: 1
                                lineHeight: 1
                            }
                        }
                        // The favorite star shows on hover or once set (components/node_menu/NodeItem.tsx).
                        Ui.ToolbarIconButton {
                            id: star
                            objectName: "catalog-favorite-" + nodeRow.modelData.type
                            visible: rowHover.hovered || active
                            active: root.favoriteTypes.includes(nodeRow.modelData.type)
                            iconName: active ? "star" : "starBorder"
                            iconSize: Ui.Metrics.iconXs
                            implicitWidth: Ui.Metrics.small
                            implicitHeight: Ui.Metrics.small
                            accessibleName: active ? qsTr("Remove from favorites") : qsTr("Add to favorites")
                            onClicked: root.catalog.toggleFavorite(nodeRow.modelData.type)
                        }
                    }
                    HoverHandler { id: rowHover }
                }
                Ui.EmptyState {
                    objectName: "catalog-empty-state"
                    anchors.centerIn: parent
                    width: parent.width
                    maxTextWidth: width - Ui.Metrics.xl
                    visible: rows.count === 0
                    title: root.nodes.length === 0 ? "No nodes loaded" : "No matching nodes"
                    message: root.nodes.length === 0 ? "Connect to a server to load nodes." : "Type to search, or pick another namespace."
                }
            }
            // NodeInfo.tsx: the hovered node's details beside the list, hidden while a search runs.
            Rectangle { Layout.fillHeight: true; Layout.preferredWidth: Ui.Metrics.border; color: roles.divider; visible: info.visible }
            Flickable {
                id: info
                objectName: "node-menu-info"
                visible: !root.homeLayout && !root.searching && !!root.hovered && root.width >= 760
                Layout.preferredWidth: 280
                Layout.fillHeight: true
                clip: true
                contentWidth: width
                contentHeight: infoColumn.implicitHeight + 2 * Ui.Metrics.lg
                boundsBehavior: Flickable.StopAtBounds
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                ColumnLayout {
                    id: infoColumn
                    x: Ui.Metrics.lg
                    y: Ui.Metrics.lg
                    width: info.width - 2 * Ui.Metrics.lg
                    spacing: Ui.Metrics.sm
                    Ui.Text { Layout.fillWidth: true; text: root.hovered ? root.hovered.label : ""; role: Ui.Typography.SansLabel; font.weight: Font.DemiBold; wrapMode: Text.WordWrap }
                    Ui.Text { Layout.fillWidth: true; text: root.hovered ? root.hovered.namespace : ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; wrapMode: Text.WrapAnywhere }
                    Ui.Text {
                        objectName: "node-menu-info-description"
                        Layout.fillWidth: true
                        text: root.hovered ? (root.hovered.description || "") : ""
                        role: Ui.Typography.SansLabel
                        font.weight: Font.Normal
                        tone: Ui.Text.Secondary
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider; visible: infoLine.visible }
        Ui.Text {
            id: infoLine
            objectName: "node-menu-info-box"
            visible: root.infoText !== ""
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.standard
            leftPadding: Ui.Metrics.lg
            rightPadding: Ui.Metrics.lg
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
            text: root.infoText
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
    }
}
