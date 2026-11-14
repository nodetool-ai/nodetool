pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The web node info panel (components/node_editor/NodeInfoPanel.tsx), which
// Ctrl+I toggles beside the selected node: the node title with a close button,
// the namespace (opens the node menu there), the description, the tags (each
// searches the node menu), the use cases, the run error and a Focus button.
Rectangle {
    id: root
    required property NodeInfo info
    readonly property real contentHeight: header.implicitHeight + Ui.Metrics.border + body.implicitHeight + Ui.Metrics.lg * 2
    // PrettyNamespace in NodeInfoPanel.tsx shortens the two common roots.
    function prettyNamespace(value) {
        return value.split(".").map(part => part.replace("huggingface", "HF").replace("nodetool", "NT")).join(".")
    }
    objectName: "node-info-panel"
    width: Ui.Metrics.panelWidth
    height: Math.min(contentHeight + Ui.Metrics.border * 2, root.info.maximumHeight > 0 ? root.info.maximumHeight : contentHeight + Ui.Metrics.border * 2)
    color: Ui.Theme.surfaceOverlay
    radius: Ui.Metrics.radiusOverlay
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    clip: true
    Keys.onEscapePressed: root.info.close()

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        spacing: 0
        RowLayout {
            id: header
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.xs
            Layout.topMargin: Ui.Metrics.xs
            Layout.bottomMargin: Ui.Metrics.xs
            spacing: Ui.Metrics.sm
            Ui.Text {
                objectName: "node-info-title"
                Layout.fillWidth: true
                text: root.info.title
                role: Ui.Typography.SansLabel
                elide: Text.ElideRight
            }
            Ui.CloseButton {
                objectName: "node-info-close"
                accessibleName: qsTr("Close node info")
                onClicked: root.info.close()
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: Ui.Theme.borderSubtle }
        Flickable {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: body.implicitHeight + Ui.Metrics.lg * 2
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: body
                x: Ui.Metrics.lg
                y: Ui.Metrics.lg
                width: scroll.width - Ui.Metrics.lg * 2
                spacing: Ui.Metrics.md
                Ui.EditorButton {
                    objectName: "node-info-namespace"
                    visible: root.info.nodeNamespace !== ""
                    Layout.fillWidth: true
                    variant: Ui.EditorButton.Flat
                    density: Ui.EditorButton.Compact
                    contentAlignment: Qt.AlignLeft
                    textRole: Ui.Typography.MonoCaption
                    text: root.prettyNamespace(root.info.nodeNamespace)
                    accessibleName: qsTr("Show %1 in the node menu").arg(root.info.nodeNamespace)
                    description: qsTr("Click to show in the node menu")
                    onClicked: root.info.showNamespace()
                }
                Ui.Text {
                    objectName: "node-info-description"
                    visible: text !== ""
                    Layout.fillWidth: true
                    text: root.info.description
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                }
                Flow {
                    objectName: "node-info-tags"
                    visible: root.info.tags.length > 0
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Repeater {
                        model: root.info.tags
                        Ui.EditorButton {
                            required property string modelData
                            objectName: "node-info-tag"
                            density: Ui.EditorButton.Compact
                            textRole: Ui.Typography.SansCaption
                            text: modelData.toUpperCase()
                            accessibleName: qsTr("Search nodes for %1").arg(modelData)
                            onClicked: root.info.searchTag(modelData)
                        }
                    }
                }
                ColumnLayout {
                    objectName: "node-info-use-cases"
                    visible: root.info.useCases.length > 0
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        text: qsTr("USE CASES")
                        role: Ui.Typography.SansCaption
                        font.weight: Font.DemiBold
                    }
                    Repeater {
                        model: root.info.useCases
                        Ui.Text {
                            required property string modelData
                            Layout.fillWidth: true
                            text: "• " + modelData
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            wrapMode: Text.Wrap
                        }
                    }
                }
                Rectangle {
                    objectName: "node-info-error"
                    visible: root.info.errorMessage !== ""
                    Layout.fillWidth: true
                    implicitHeight: errorText.implicitHeight + Ui.Metrics.md * 2
                    radius: Ui.Metrics.radiusControl
                    color: Ui.Theme.statusErrorSurface
                    Rectangle { width: Ui.Metrics.focus; height: parent.height; color: Ui.Theme.statusError }
                    Ui.Text {
                        id: errorText
                        x: Ui.Metrics.lg
                        y: Ui.Metrics.md
                        width: parent.width - Ui.Metrics.lg - Ui.Metrics.md
                        text: root.info.errorMessage
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Error
                        wrapMode: Text.Wrap
                    }
                }
                Ui.EditorButton {
                    objectName: "node-info-focus"
                    Layout.topMargin: Ui.Metrics.xs
                    text: qsTr("Focus")
                    iconName: "openInNew"
                    density: Ui.EditorButton.Compact
                    onClicked: root.info.focusNode()
                }
            }
        }
    }
}
