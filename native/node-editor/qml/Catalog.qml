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
    readonly property var nodes: editor ? editor.catalog : []
    readonly property var categoryList: editor ? editor.catalogCategories : []
    // Optional packs that are off hide their nodes. A search still finds them.
    readonly property var browsable: {
        const optionalCategories = editor.packSetup.categories
        return nodes.filter(node => editor.packSetup.namespaceVisible(node.namespace))
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
    // The full query, its last dotted segment, and their whitespace or comma
    // pieces (web utils/nodeSearch.ts rankSearchNodes, utils/ranking.ts searchTermsFromQuery).
    function searchTerms(text) {
        const trimmed = text.trim().toLowerCase()
        if (trimmed === "") {
            return []
        }
        const queries = [trimmed]
        const parts = trimmed.split(".").filter(part => part !== "")
        if (parts.length > 0 && parts[parts.length - 1] !== trimmed) {
            queries.push(parts[parts.length - 1])
        }
        const terms = []
        for (const entry of queries) {
            for (const piece of [entry].concat(entry.split(/[\s,]+/))) {
                if (piece !== "" && !terms.includes(piece)) {
                    terms.push(piece)
                }
            }
        }
        return terms
    }
    function squash(text) {
        return String(text).toLowerCase().replace(/[\s._\-/]+/g, "")
    }
    function isSubsequence(text, term) {
        let index = 0
        for (const character of text) {
            if (character === term[index]) {
                index += 1
                if (index === term.length) {
                    return true
                }
            }
        }
        return false
    }
    // Web field weights: title 6, node type 4, namespace 2, description 1. A
    // whole token adds twice the weight. The loose pass, used only when nothing
    // matches literally, scores separator-free matches at 0.6 and subsequences of
    // four or more characters at 0.3. Core namespaces score 1.5 times and
    // deprecated nodes 0.15 times (utils/ranking.ts fieldScore, looseFieldScore,
    // utils/nodeRanking.ts FIELD_WEIGHTS, CORE_MULTIPLIER).
    function searchScore(node, terms, loose) {
        const fields = [[node.label, 6], [node.type, 4], [node.namespace, 2], [node.description || "", 1]]
        let total = 0
        for (const field of fields) {
            if (loose) {
                const squashed = squash(field[0])
                for (const term of terms) {
                    const squashedTerm = squash(term)
                    if (squashed === "" || squashedTerm === "") {
                        continue
                    }
                    if (squashed.includes(squashedTerm)) {
                        total += field[1] * 0.6
                    } else if (squashedTerm.length >= 4 && isSubsequence(squashed, squashedTerm)) {
                        total += field[1] * 0.3
                    }
                }
                continue
            }
            const lower = String(field[0]).toLowerCase()
            const tokens = lower.split(/[\s._\-/]+/)
            for (const term of terms) {
                if (!lower.includes(term)) {
                    continue
                }
                total += field[1]
                if (tokens.includes(term)) {
                    total += field[1] * 2
                }
            }
        }
        const core = node.namespace === "nodetool" || node.namespace.startsWith("nodetool.")
        return total * (core ? 1.5 : 1) * (node.deprecated ? 0.15 : 1)
    }
    // Recent nodes add 10 / (rank + 1) and the quick-action types add 6, with or
    // without a query (utils/ranking.ts rankPass, config/quickActionNodeTypes.ts).
    readonly property var quickActionTypes: [
        "nodetool.agents.Agent", "nodetool.code.Code", "nodetool.image.TextToImage", "nodetool.image.ImageToImage",
        "nodetool.image.Upscale", "nodetool.image.RemoveBackground", "nodetool.image.Relight", "nodetool.image.Vectorize",
        "nodetool.video.TextToVideo", "nodetool.video.ImageToVideo", "nodetool.video.ReferenceToVideo", "nodetool.video.VideoToVideo",
        "nodetool.video.LipSync", "nodetool.audio.TextToSpeech", "nodetool.text.AutomaticSpeechRecognition",
        "nodetool.constant.Bool", "nodetool.constant.DataFrame", "nodetool.constant.Date", "nodetool.constant.DateTime",
        "nodetool.constant.Dict", "nodetool.constant.Audio", "nodetool.constant.Document", "nodetool.constant.Float",
        "nodetool.constant.Image", "nodetool.constant.Integer", "nodetool.constant.JSON", "nodetool.constant.List",
        "nodetool.constant.Model3D", "nodetool.constant.String", "nodetool.constant.Video"
    ]
    readonly property var recentTypes: editor ? editor.catalogRecent : []
    function boost(node) {
        const recent = recentTypes.indexOf(node.type)
        return (recent < 0 ? 0 : 10 / (recent + 1)) + (quickActionTypes.includes(node.type) ? 6 : 0)
    }
    function rankPass(listed, terms, loose) {
        const scored = []
        for (const node of listed) {
            const base = terms.length > 0 ? searchScore(node, terms, loose) : 0
            if (terms.length > 0 && base === 0) {
                continue
            }
            scored.push({ node: node, score: base + boost(node) })
        }
        scored.sort((a, b) => b.score - a.score || a.node.type.localeCompare(b.node.type))
        return scored.map(entry => entry.node)
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
        const terms = searchTerms(query)
        const listed = nodes.filter(node => (terms.length > 0 || editor.packSetup.namespaceVisible(node.namespace))
            && (category === "all" || node.categories.includes(category))
            && (activeProvider === "" || node.provider === activeProvider))
        const strict = rankPass(listed, terms, false)
        return strict.length > 0 || terms.length === 0 ? strict : rankPass(listed, terms, true)
    }
    function moveHighlight(delta) {
        const count = visibleNodes.length
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
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.xxxl
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            Ui.Text { text: "Nodes"; role: Ui.Typography.SansLabel; font.weight: Font.Normal; lineHeight: 1 }
            Ui.Text { objectName: "catalog-count"; text: root.visibleNodes.length; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
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
            ListView {
                id: rows
                objectName: "catalog-rows"
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
                    }
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
