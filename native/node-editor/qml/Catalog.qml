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
    property string category: ""
    property var hovered: null
    readonly property var nodes: editor ? editor.catalog : []
    readonly property var categories: {
        const optionalCategories = editor.packSetup.categories
        const counts = {}
        for (const node of nodes) {
            if (editor.packSetup.namespaceVisible(node.namespace)) counts[node.category] = (counts[node.category] || 0) + 1
        }
        return Object.keys(counts).sort().map(name => ({name: name, count: counts[name]}))
    }
    readonly property var visibleNodes: {
        const optionalCategories = editor.packSetup.categories
        const needle = query.trim().toLowerCase()
        return nodes.filter(node => (needle !== "" || editor.packSetup.namespaceVisible(node.namespace))
            && (category === "" || node.category === category)
            && (needle === "" || node.label.toLowerCase().includes(needle) || node.namespace.toLowerCase().includes(needle)))
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
            Ui.Text { objectName: "catalog-count"; text: root.nodes.length; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
            Item { Layout.fillWidth: true }
        }
        Ui.TextField {
            id: search
            objectName: "nodeSearch"
            accessibleName: "Search nodes"
            placeholderText: "Search nodes..."
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
            TypeIcon { x: Ui.Metrics.sm; anchors.verticalCenter: parent.verticalCenter; name: "search"; size: Ui.Metrics.iconSm }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0
            ColumnLayout {
                Layout.preferredWidth: Ui.Metrics.xxxl * 4
                Layout.fillHeight: true
                spacing: Ui.Metrics.sm
            ListView {
                id: namespaces
                objectName: "catalog-namespaces"
                Layout.preferredWidth: root.nodes.length === 0 ? 0 : Math.min(124, root.width * 0.4)
                visible: root.nodes.length > 0
                Layout.fillHeight: true
                Layout.topMargin: Ui.Metrics.xs
                clip: true
                spacing: 0
                boundsBehavior: Flickable.StopAtBounds
                model: [{name: "", count: root.nodes.length}].concat(root.categories)
                delegate: PanelRow {
                    id: namespaceRow
                    required property var modelData
                    readonly property string title: modelData.name === "" ? "All" : modelData.name
                    x: Ui.Metrics.xs
                    width: ListView.view.width - Ui.Metrics.md
                    height: Ui.Metrics.compact
                    implicitHeight: Ui.Metrics.compact
                    text: title
                    active: root.category === modelData.name
                    onClicked: root.category = modelData.name
                    Rectangle { anchors.verticalCenter: parent.verticalCenter; visible: namespaceRow.active; width: Ui.Metrics.micro; height: Ui.Metrics.iconSm; color: Ui.Theme.accentPrimary }
                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.md
                        anchors.rightMargin: Ui.Metrics.sm
                        spacing: Ui.Metrics.xs
                        Ui.Text { Layout.fillWidth: true; text: namespaceRow.title; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: namespaceRow.active ? Ui.Text.Primary : Ui.Text.Secondary; elide: Text.ElideRight; lineHeight: 1 }
                        Ui.Text { text: namespaceRow.modelData.count; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
                    }
                }
            }
                OptionalPacksSection {
                    Layout.fillWidth: true
                    Layout.margins: Ui.Metrics.sm
                }
            }
            ListView {
                id: rows
                objectName: "catalog-rows"
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
                    anchors.centerIn: parent
                    width: parent.width
                    maxTextWidth: width - Ui.Metrics.xl
                    visible: rows.count === 0
                    title: root.nodes.length === 0 ? "No nodes loaded" : "No matching nodes"
                    message: root.nodes.length === 0 ? "Connect to a server to load nodes." : "Try a different name or namespace."
                }
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        Ui.Text {
            objectName: "catalog-help"
            Layout.fillWidth: true
            Layout.preferredHeight: 96
            leftPadding: Ui.Metrics.lg; rightPadding: Ui.Metrics.lg
            horizontalAlignment: root.hovered ? Text.AlignLeft : Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            wrapMode: Text.WordWrap
            elide: Text.ElideRight
            text: root.hovered ? (root.hovered.description || root.hovered.label) : "Click or drag a node onto the canvas. Hover for details."
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
            Ui.Text { Layout.fillWidth: true; text: root.category === "" ? "All" : root.category; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: Ui.Text.Secondary; lineHeight: 1 }
            Ui.Text { text: "click or drag to add"; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: Ui.Text.Secondary; lineHeight: 1 }
        }
    }
}
