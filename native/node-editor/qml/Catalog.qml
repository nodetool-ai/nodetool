pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web Node Library: search, namespaces with counts, and node rows.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: 310
    property string query: ""
    // A category id from editor.catalogCategories. "all" lists every node.
    property string category: "all"
    property var hovered: null
    // The node menu is the library armed for pointer placement (Space, a pane
    // double-click). It adds the type chips and the home tiles of the web menu
    // (components/node_menu/TypeFilterChips.tsx, NamespaceList.tsx). The docked
    // library keeps the web library layout, so its list ignores these filters.
    readonly property bool menuMode: !!editor && editor.catalogAtPointer
    property string inputType: ""
    property string outputType: ""
    // "all", "local" or "api", from the Local and API chips.
    property string providerKind: "all"
    readonly property string activeInputType: menuMode ? inputType : ""
    readonly property string activeOutputType: menuMode ? outputType : ""
    readonly property string activeKind: menuMode ? providerKind : "all"
    // The types that nodes declare, as the filter menus list them (TypeFilterChips.tsx allTypeOptions).
    readonly property var typeOptions: {
        const seen = new Set()
        for (const node of nodes) {
            node.inputTypes.forEach(type => seen.add(type))
            node.outputTypes.forEach(type => seen.add(type))
        }
        return Array.from(seen).sort((a, b) => a.localeCompare(b))
    }
    function typeLabel(type) {
        return type === "float" ? qsTr("Number") : type
    }
    readonly property var quickActions: editor ? editor.catalogQuickActions() : []
    readonly property var favoriteTypes: editor ? editor.catalogFavorites : []
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
    // Nothing typed, picked or filtered: the menu shows tiles instead of the list (NamespaceList.tsx isHomeLayout).
    readonly property bool homeLayout: menuMode && nodes.length > 0 && query.trim() === "" && category === "all"
        && activeProvider === "" && activeKind === "all" && activeInputType === "" && activeOutputType === ""
    function tileLabel(type) {
        const node = nodeIndex[type]
        return node ? node.label : type.split(".").pop()
    }
    readonly property var nodes: editor ? editor.catalog : []
    // Nodes whose provider key is missing stay out of the lists unless the user
    // shows them (web hooks/useNodeProviderFilter.ts, MissingKeyNodesNotice.tsx).
    // Before the server's secrets arrive nothing is known, so every node is listed.
    readonly property var configuredKeys: editor ? editor.packSetup.configuredKeys : []
    readonly property bool keyFilterActive: !!editor && editor.packSetup.secretsLoaded
    readonly property bool showWithoutKey: !!editor && editor.packSetup.showNodesWithoutKey
    function needsMissingKey(node) {
        return keyFilterActive && !!node.keyGate && !configuredKeys.includes(node.keyGate)
    }
    readonly property int missingKeyCount: nodes.filter(node => needsMissingKey(node)).length
    readonly property var listedNodes: showWithoutKey ? nodes : nodes.filter(node => !needsMissingKey(node))
    function focusSearch() {
        search.forceActiveFocus(Qt.OtherFocusReason)
    }
    readonly property var categoryList: editor ? editor.catalogCategories : []
    // Optional packs that are off hide their nodes. A search still finds them.
    readonly property var browsable: {
        const optionalCategories = editor.packSetup.categories
        return listedNodes.filter(node => editor.packSetup.namespaceVisible(node.namespace))
    }
    // The web counts every category over the nodes it lists, so the counts ignore the search.
    readonly property var categories: categoryList.map(entry => ({
        id: entry.id,
        label: entry.label,
        icon: entry.icon,
        count: entry.id === "all"
            ? providerNodes.length
            : providerNodes.filter(node => node.categories.includes(entry.id)).length
    }))
    readonly property string categoryLabel: {
        const found = categoryList.find(entry => entry.id === category)
        return found ? found.label : "All"
    }
    // The row the arrow keys picked. Enter adds it. A new search clears it, as in
    // the web menu (stores/NodeMenuStore.ts moveSelectionUp/Down, setSearchTerm).
    property int highlighted: -1
    onQueryChanged: highlighted = -1
    onCategoryChanged: highlighted = -1
    onActiveInputTypeChanged: highlighted = -1
    onActiveOutputTypeChanged: highlighted = -1
    onActiveKindChanged: highlighted = -1
    // The web search order: prefix, BM25 and fuzzy boosts over the field scores,
    // with recent and quick-action nodes first (utils/nodeSearch.ts rankSearchNodes).
    // The ranking runs in src/graph/CatalogSearch.cpp.
    readonly property var recentTypes: editor ? editor.catalogRecent : []
    function rankNodes(listed, text) {
        // Reading recentTypes re-ranks when a node is added.
        void recentTypes
        return editor.rankCatalog(listed, text).map(index => listed[index])
    }
    // The provider filter of the web library (components/node_menu/NodeLibrary.tsx:363-430).
    // "" lists every provider. A provider that left the list stops filtering.
    property string provider: ""
    onProviderChanged: highlighted = -1
    readonly property var categoryNodes: browsable.filter(node => category === "all" || node.categories.includes(category))
    readonly property var providerOptions: {
        const ids = []
        for (const node of browsable) {
            if (!ids.includes(node.provider)) {
                ids.push(node.provider)
            }
        }
        const options = ids.map(id => ({
            value: id,
            label: browsable.find(node => node.provider === id).providerName,
            shortcutText: String(categoryNodes.filter(node => node.provider === id).length)
        }))
        options.sort((a, b) => a.value === "local" ? -1 : b.value === "local" ? 1 : a.label.localeCompare(b.label))
        return [{ value: "", label: "All providers", shortcutText: String(categoryNodes.length) }].concat(options)
    }
    readonly property string activeProvider: providerOptions.some(option => option.value === provider) ? provider : ""
    readonly property var providerNodes: activeProvider === "" ? browsable : browsable.filter(node => node.provider === activeProvider)
    readonly property var visibleNodes: {
        const optionalCategories = editor.packSetup.categories
        const searching = query.trim() !== ""
        const listed = listedNodes.filter(node => (searching || editor.packSetup.namespaceVisible(node.namespace))
            && (category === "all" || node.categories.includes(category))
            && (activeProvider === "" || node.provider === activeProvider)
            && (activeKind === "all" || (node.provider === "local") === (activeKind === "local"))
            && (activeInputType === "" || node.inputTypes.includes(activeInputType))
            && (activeOutputType === "" || node.outputTypes.includes(activeOutputType)))
        return rankNodes(listed, query)
    }
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
        if (highlighted < 0 || highlighted >= visibleNodes.length || !editor || editor.readOnly) {
            return false
        }
        editor.addNode(visibleNodes[highlighted].type)
        return true
    }
    function clearSearch() {
        search.text = ""
        query = ""
    }
    // A tile of the node menu home: the node's type icon and its label (QuickActionTiles.tsx,
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
        enabled: !!node && !!editor && !editor.readOnly
        onClicked: editor.addNode(tileType)
        DragHandler {
            target: null
            onActiveChanged: if (active && editor && tile.node) editor.dragNode(tile.tileType)
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
            readonly property int columns: Math.max(1, Math.floor(width / 112))
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
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.xxxl
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            Ui.Text {
                text: "Nodes"
                role: Ui.Typography.SansLabel
                font.weight: Font.Normal
                lineHeight: 1
                // The PanelHeader title tooltip (config/quickAccessCategories.tsx, nodes).
                HoverHandler { onHoveredChanged: if (editor) editor.showToolTip(hovered ? qsTr("Browse, search, and add nodes to the current workflow.") : "") }
            }
            Ui.Text { objectName: "catalog-count"; text: root.visibleNodes.length; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
            // DocsHelpLink.tsx in its label variant: an open-in-new icon to the docs topic.
            Ui.EditorButton {
                id: docsLink
                objectName: "catalog-docs"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "openInNew"
                iconSize: Ui.Metrics.iconXs
                iconTone: hovered ? Ui.Text.Primary : Ui.Text.Disabled
                implicitWidth: Ui.Metrics.small
                implicitHeight: Ui.Metrics.small
                leftPadding: Ui.Metrics.none
                rightPadding: Ui.Metrics.none
                accessibleName: qsTr("Nodes documentation")
                onHoveredChanged: if (editor) editor.showToolTip(hovered ? accessibleName : "")
                onClicked: Qt.openUrlExternally("https://docs.nodetool.ai/nodes/")
            }
            Item { Layout.fillWidth: true }
        }
        Ui.TextField {
            id: search
            objectName: "nodeSearch"
            accessibleName: "Search nodes"
            placeholderText: "Search nodes"
            density: Ui.EditorButton.Compact
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
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
            // Arrows pick a row, Enter adds it, Ctrl+Backspace clears, and Escape
            // closes the pointer menu (web components/search/SearchInput.tsx).
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
                    root.clearSearch()
                    event.accepted = true
                } else if (event.key === Qt.Key_Space && search.text === "" && editor && editor.catalogAtPointer) {
                    // Space in an empty search closes the pointer menu (SearchInput.tsx:159-166).
                    editor.cancelCatalogPlacement()
                    editor.focusCanvas()
                    event.accepted = true
                } else if (event.key === Qt.Key_Escape) {
                    root.clearSearch()
                    if (editor && editor.catalogAtPointer) {
                        editor.cancelCatalogPlacement()
                        editor.focusCanvas()
                    }
                    event.accepted = true
                }
            }
            TypeIcon { x: Ui.Metrics.sm; anchors.verticalCenter: parent.verticalCenter; name: "search"; size: Ui.Metrics.iconSm }
            rightPadding: providerChip.visible ? providerChip.width + Ui.Metrics.sm : Ui.Metrics.md
            // The provider chip inside the search row appears with two or more
            // providers (web components/node_menu/NodeProviderFilter.tsx, NodeLibrary.tsx:537-544).
            Ui.ChipMenu {
                id: providerChip
                objectName: "catalog-provider-filter"
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.micro
                anchors.verticalCenter: parent.verticalCenter
                visible: root.providerOptions.length > 2
                density: Ui.EditorButton.Compact
                trailingIconName: "arrowDropDown"
                accessibleName: "Provider filter: " + text
                options: root.providerOptions
                value: root.activeProvider
                onValueCommitted: value => root.provider = value
            }
        }
        // Local and API providers, output types and the two type menus of the node menu.
        Flow {
            id: typeChips
            objectName: "catalog-type-chips"
            visible: root.menuMode
            Layout.fillWidth: true
            Layout.preferredHeight: visible ? implicitHeight : 0
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            Layout.bottomMargin: Ui.Metrics.sm
            spacing: Ui.Metrics.xs
            Repeater {
                model: [{ id: "local", label: qsTr("Local") }, { id: "api", label: qsTr("API") }]
                delegate: Ui.EditorButton {
                    required property var modelData
                    objectName: "catalog-chip-" + modelData.id
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    circular: true
                    text: modelData.label
                    active: root.providerKind === modelData.id
                    onClicked: root.providerKind = active ? "all" : modelData.id
                }
            }
            Ui.Text {
                height: Ui.Metrics.compact
                verticalAlignment: Text.AlignVCenter
                leftPadding: Ui.Metrics.xs
                text: qsTr("Output")
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Repeater {
                model: [{ id: "image", type: "image", label: qsTr("Image") }, { id: "text", type: "text", label: qsTr("Text") },
                        { id: "audio", type: "audio", label: qsTr("Audio") }, { id: "video", type: "video", label: qsTr("Video") },
                        { id: "number", type: "float", label: qsTr("Number") }]
                delegate: Ui.EditorButton {
                    required property var modelData
                    objectName: "catalog-chip-" + modelData.id
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    circular: true
                    text: modelData.label
                    accessibleName: qsTr("Filter by %1").arg(modelData.label)
                    active: root.inputType === modelData.type || root.outputType === modelData.type
                    onClicked: root.outputType = root.outputType === modelData.type ? "" : modelData.type
                }
            }
            Ui.ChipMenu {
                objectName: "catalog-input-type"
                density: Ui.EditorButton.Compact
                trailingIconName: "arrowDropDown"
                accessibleName: qsTr("Input type: %1").arg(text)
                options: [{ value: "", label: qsTr("All input types") }].concat(root.typeOptions.map(type => ({ value: type, label: root.typeLabel(type) })))
                value: root.inputType
                onValueCommitted: value => root.inputType = value
            }
            Ui.ChipMenu {
                objectName: "catalog-output-type"
                density: Ui.EditorButton.Compact
                trailingIconName: "arrowDropDown"
                accessibleName: qsTr("Output type: %1").arg(text)
                options: [{ value: "", label: qsTr("All output types") }].concat(root.typeOptions.map(type => ({ value: type, label: root.typeLabel(type) })))
                value: root.outputType
                onValueCommitted: value => root.outputType = value
            }
            Ui.Text {
                objectName: "catalog-type-count"
                height: Ui.Metrics.compact
                verticalAlignment: Text.AlignVCenter
                leftPadding: Ui.Metrics.xs
                text: root.listedNodes.length === 1 ? qsTr("1 node") : qsTr("%1 nodes").arg(root.listedNodes.length)
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
        RowLayout {
            objectName: "catalog-missing-key"
            visible: root.missingKeyCount > 0
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            Layout.bottomMargin: Ui.Metrics.sm
            spacing: Ui.Metrics.xs
            Ui.Text {
                objectName: "catalog-missing-key-text"
                Layout.fillWidth: true
                text: root.showWithoutKey
                    ? (root.missingKeyCount === 1 ? qsTr("Showing 1 node that needs an API key.") : qsTr("Showing %1 nodes that need an API key.").arg(root.missingKeyCount))
                    : (root.missingKeyCount === 1 ? qsTr("1 node needs an API key you have not added.") : qsTr("%1 nodes need an API key you have not added.").arg(root.missingKeyCount))
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                wrapMode: Text.WordWrap
            }
            Ui.EditorButton {
                objectName: "catalog-missing-key-toggle"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                text: root.showWithoutKey ? qsTr("Hide them") : qsTr("Show them")
                onClicked: editor.packSetup.showNodesWithoutKey = !root.showWithoutKey
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        // A loaded catalog puts the namespaces beside the nodes and the optional
        // packs below both lists. An empty catalog stacks the packs above the
        // empty message, so a narrow panel keeps both readable.
        GridLayout {
            id: lists
            readonly property bool empty: root.nodes.length === 0
            columns: empty ? 1 : 2
            Layout.fillWidth: true
            Layout.fillHeight: true
            rowSpacing: Ui.Metrics.none
            columnSpacing: Ui.Metrics.none
            ListView {
                id: namespaces
                objectName: "catalog-categories"
                Layout.row: 0
                Layout.column: 0
                Layout.preferredWidth: root.nodes.length === 0 ? 0 : Math.min(156, root.width * 0.42)
                visible: root.nodes.length > 0
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.xs
                clip: true
                spacing: 0
                boundsBehavior: Flickable.StopAtBounds
                model: root.categories
                delegate: PanelRow {
                    id: categoryRow
                    required property var modelData
                    objectName: "catalog-category-" + modelData.id
                    x: Ui.Metrics.xs
                    width: ListView.view.width - Ui.Metrics.md
                    height: Ui.Metrics.compact
                    implicitHeight: Ui.Metrics.compact
                    text: modelData.label
                    active: root.category === modelData.id
                    onClicked: root.category = modelData.id
                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: categoryRow.active
                        width: Ui.Metrics.micro
                        height: Ui.Metrics.iconSm
                        color: Ui.Theme.accentPrimary
                    }
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.md
                        anchors.rightMargin: Ui.Metrics.sm
                        spacing: Ui.Metrics.xs
                        Ui.Icon {
                            name: categoryRow.modelData.icon
                            size: Ui.Metrics.iconSm
                            tone: Ui.Text.Secondary
                            domainColor: categoryRow.active ? Ui.Theme.accentPrimary : undefined
                        }
                        Ui.Text {
                            Layout.fillWidth: true
                            text: categoryRow.modelData.label
                            role: Ui.Typography.SansLabel
                            font.weight: Font.Normal
                            tone: categoryRow.active ? Ui.Text.Primary : Ui.Text.Secondary
                            elide: Text.ElideRight
                            lineHeight: 1
                        }
                        Ui.Text {
                            text: categoryRow.modelData.count
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            lineHeight: 1
                        }
                    }
                }
            }
            Flickable {
                id: home
                objectName: "catalog-home"
                visible: root.homeLayout
                Layout.row: 0
                Layout.column: 1
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.xs
                clip: true
                contentWidth: width
                contentHeight: homeColumn.implicitHeight
                boundsBehavior: Flickable.StopAtBounds
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                ColumnLayout {
                    id: homeColumn
                    width: home.width - Ui.Metrics.xs
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
                        onCleared: editor.clearCatalogFavorites()
                        onRemoved: type => editor.toggleCatalogFavorite(type)
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
                        onCleared: editor.clearCatalogRecent()
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
                Layout.row: lists.empty ? 1 : 0
                Layout.column: lists.empty ? 0 : 1
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
                    width: ListView.view.width - Ui.Metrics.xs
                    height: 40
                    implicitHeight: 40
                    text: modelData.label
                    enabled: editor && !editor.readOnly
                    objectName: "catalog-node-" + modelData.type
                    onClicked: editor.addNode(modelData.type)
                    DragHandler {
                        objectName: "catalog-drag-" + nodeRow.modelData.type
                        target: null
                        onActiveChanged: if (active && editor) editor.dragNode(nodeRow.modelData.type)
                    }
                    onHoveredChanged: root.hovered = hovered ? modelData : null
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.xs
                        anchors.rightMargin: Ui.Metrics.xs
                        spacing: Ui.Metrics.xs
                        Rectangle {
                            Layout.preferredWidth: 22; Layout.preferredHeight: 22
                            Layout.leftMargin: Ui.Metrics.micro; Layout.rightMargin: Ui.Metrics.micro
                            radius: Ui.Metrics.radiusControl
                            color: Qt.rgba(tile.ink.r, tile.ink.g, tile.ink.b, 0.08)
                            border.width: Ui.Metrics.border
                            border.color: Qt.rgba(tile.ink.r, tile.ink.g, tile.ink.b, 0.14)
                            TypeIcon { id: tile; anchors.centerIn: parent; name: nodeRow.modelData.icon; size: Ui.Metrics.iconXs; ink: nodeRow.modelData.color }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.micro
                            Ui.Text { objectName: "nativeButtonLabel"; Layout.fillWidth: true; text: nodeRow.modelData.label; role: Ui.Typography.SansLabel; font.weight: Font.Normal; elide: Text.ElideRight; lineHeight: 1 }
                            Ui.Text { Layout.fillWidth: true; text: nodeRow.modelData.namespace; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight; lineHeight: 1 }
                        }
                        // The favorite star shows on hover or once set (components/node_menu/NodeLibraryRow.tsx).
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
                            onClicked: editor.toggleCatalogFavorite(nodeRow.modelData.type)
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
                    message: root.nodes.length === 0 ? "Connect to a server to load nodes." : "Try a different name or namespace."
                }
            }
            OptionalPacksSection {
                Layout.row: lists.empty ? 0 : 1
                Layout.column: 0
                Layout.columnSpan: lists.columns
                Layout.fillWidth: true
                Layout.fillHeight: false
                Layout.margins: Ui.Metrics.sm
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        Ui.Text {
            objectName: "catalog-help"
            visible: root.nodes.length > 0
            Layout.fillWidth: true
            Layout.preferredHeight: 96
            leftPadding: Ui.Metrics.lg; rightPadding: Ui.Metrics.lg
            horizontalAlignment: root.hovered ? Text.AlignLeft : Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideRight
            text: root.hovered ? (root.hovered.description || root.hovered.label) : "Drag a node onto the canvas. Hover for details."
            role: Ui.Typography.SansLabel
            font.weight: Font.Normal
            tone: Ui.Text.Secondary
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.standard
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            Ui.Text { objectName: "catalog-footer-category"; Layout.fillWidth: true; text: root.categoryLabel; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: Ui.Text.Secondary; lineHeight: 1 }
            Ui.Text { objectName: "catalog-footer-hint"; text: editor && editor.catalogAtPointer ? "adds at the pointer" : "drag to add"; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: Ui.Text.Secondary; lineHeight: 1 }
        }
    }
}
