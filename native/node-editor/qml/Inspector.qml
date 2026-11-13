pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The web Inspector: node header, Params / I/O / Help tabs, and scrolled fields.
Rectangle {
    id: root
    required property NodeInspector inspector
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: 350
    property int tab: 0
    readonly property var info: inspector.selectionInfo
    readonly property var fieldsModel: inspector.properties
    readonly property bool hasSelection: inspector.selection !== ""
    // RunSelectedNodesSection.tsx: the run count lives with the open inspector.
    property int runs: 1
    readonly property bool canRun: inspector.canRun
    // Debounced, so a burst of preview runs does not flicker the run controls.
    readonly property bool running: inspector.running
    readonly property var runProgress: inspector.runProgress
    readonly property var cost: inspector.costEstimate
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            visible: root.hasSelection
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
            Layout.rightMargin: Ui.Metrics.sm
            Layout.topMargin: Ui.Metrics.md
            Layout.bottomMargin: Ui.Metrics.sm
            spacing: Ui.Metrics.sm
            Rectangle {
                width: Ui.Metrics.small; height: width
                radius: Ui.Metrics.radiusControl
                color: roles.field
                TypeIcon { anchors.centerIn: parent; name: root.info.icon || "help"; size: Ui.Metrics.iconSm; ink: Ui.Theme.textPrimary }
            }
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 0
                Ui.Text { objectName: "inspector-title"; Layout.fillWidth: true; text: root.info.title || root.inspector.selection; role: Ui.Typography.SansLabel; font.weight: Font.Normal; elide: Text.ElideRight; lineHeight: 1.3 }
                Ui.Text { objectName: "inspector-namespace"; Layout.fillWidth: true; visible: text !== ""; text: root.info.namespace || ""; role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary; elide: Text.ElideMiddle; lineHeight: 1.3 }
            }
            NodeButton { objectName: "inspector-close"; text: ""; accessibleName: "Close inspector"; iconName: "close"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.compact; onClicked: root.inspector.clearSelection() }
        }
        Item {
            visible: root.hasSelection
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.compact
            Ui.TabBar {
                x: Ui.Metrics.lg
                height: parent.height
                accessibleName: "Inspector"
                value: root.tab
                tabs: [
                    { objectName: "tab-params", value: 0, label: "Params", count: root.fieldsModel.length },
                    { objectName: "tab-io", value: 1, label: "I/O", count: (root.info.inputs ? root.info.inputs.length : 0) + (root.info.outputs ? root.info.outputs.length : 0) },
                    { objectName: "tab-help", value: 2, label: "Help" },
                    { objectName: "tab-history", value: 3, label: "History" }
                ]
                onValueCommitted: value => root.tab = value
            }
        }
        Rectangle { visible: root.hasSelection; Layout.fillWidth: true; Layout.preferredHeight: Ui.Metrics.border; color: roles.divider }
        Ui.Text {
            objectName: "inspector-empty"
            visible: !root.hasSelection
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
            text: "Select a node"
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Flickable {
            id: scroll
            objectName: "property-scroll"
            visible: root.hasSelection && root.tab === 0
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: fields.implicitHeight + Ui.Metrics.lg * 2
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: fields
                x: Ui.Metrics.lg
                y: Ui.Metrics.lg
                width: scroll.width - Ui.Metrics.lg * 2
                spacing: Ui.Metrics.lg
                Repeater {
                    model: root.fieldsModel.length
                    PropertyField {
                        required property int index
                        Layout.fillWidth: true
                        descriptor: root.fieldsModel[index] || ({})
                        host: root.inspector.fields
                        nodeId: root.inspector.selection
                    }
                }
            }
        }
        Flickable {
            id: ioScroll
            objectName: "inspector-io"
            visible: root.hasSelection && root.tab === 1
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: ioColumn.implicitHeight + Ui.Metrics.lg * 2
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: ioColumn
                x: Ui.Metrics.lg
                y: Ui.Metrics.lg
                width: ioScroll.width - Ui.Metrics.lg * 2
                spacing: Ui.Metrics.sm
                Loader { Layout.fillWidth: true; active: root.inspector.dynamicPorts !== null; sourceComponent: DynamicPorts { controller: root.inspector.dynamicPorts; enabled: !root.inspector.readOnly } }
                Repeater {
                    model: [{title: "Inputs", ports: root.info.inputs || []}, {title: "Outputs", ports: root.info.outputs || []}]
                    ColumnLayout {
                        id: ioGroup
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.micro
                        Ui.Text { text: ioGroup.modelData.title; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; Layout.bottomMargin: Ui.Metrics.xs }
                        Repeater {
                            model: ioGroup.modelData.ports
                            RowLayout {
                                id: ioRow
                                required property var modelData
                                Layout.fillWidth: true
                                Layout.preferredHeight: Ui.Metrics.compact
                                spacing: Ui.Metrics.md
                                Rectangle { width: Ui.Metrics.md; height: width; radius: width / 2; color: ioRow.modelData.color }
                                Ui.Text { Layout.fillWidth: true; text: ioRow.modelData.name; role: Ui.Typography.SansLabel; font.weight: Font.Normal; elide: Text.ElideRight; lineHeight: 1 }
                                Ui.Text { text: ioRow.modelData.type; role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary; lineHeight: 1 }
                            }
                        }
                    }
                }
            }
        }
        Flickable {
            id: helpScroll
            objectName: "inspector-help"
            visible: root.hasSelection && root.tab === 2
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: helpText.implicitHeight + focusButton.height + Ui.Metrics.lg * 3
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            Ui.Text {
                id: helpText
                x: Ui.Metrics.lg
                y: Ui.Metrics.lg
                width: helpScroll.width - Ui.Metrics.lg * 2
                wrapMode: Text.Wrap
                text: root.info.description || "No help is available for this node."
                role: Ui.Typography.SansBody
                tone: Ui.Text.Secondary
            }
            // NodeInfoPanel.tsx: the Focus button centers the canvas on the node.
            NodeButton {
                id: focusButton
                objectName: "inspector-focus"
                x: Ui.Metrics.lg
                y: helpText.y + helpText.implicitHeight + Ui.Metrics.lg
                text: qsTr("Focus")
                iconName: "myLocation"
                onClicked: root.inspector.focusNode()
            }
        }
        Loader {
            visible: root.hasSelection && root.tab === 3
            active: visible
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: Component { GenerationHistory { generations: root.inspector.history; resolver: root.inspector.fields.media } }
        }
        Item { visible: !root.hasSelection; Layout.fillHeight: true }
        Ui.Text {
            objectName: "inspector-message"
            visible: text !== ""
            text: root.inspector.readOnly ? root.inspector.readOnlyReason : root.inspector.message
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.WrapAnywhere
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
        }
        // The web inspector footer (inspector/RunSelectedNodesSection.tsx): a Runs
        // stepper from 1 to 32 beside Run selected, on the canvas surface.
        Rectangle {
            visible: root.hasSelection && root.canRun
            Layout.fillWidth: true
            Layout.preferredHeight: runFooter.implicitHeight + Ui.Metrics.md + Ui.Metrics.lg
            color: roles.canvas
            Rectangle { width: parent.width; height: Ui.Metrics.border; color: roles.divider }
            GridLayout {
                id: runFooter
                objectName: "inspector-run-footer"
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.leftMargin: Ui.Metrics.lg
                anchors.rightMargin: Ui.Metrics.lg
                anchors.topMargin: Ui.Metrics.md
                // The web stacks the two rows below a 240 px container.
                columns: root.width > 240 ? 2 : 1
                columnSpacing: Ui.Metrics.md
                rowSpacing: Ui.Metrics.sm
                RowLayout {
                    spacing: Ui.Metrics.xs
                    Ui.Text { objectName: "inspector-runs-label"; text: qsTr("Runs"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    Rectangle {
                        implicitWidth: stepper.implicitWidth + Ui.Metrics.xs * 2
                        implicitHeight: stepper.implicitHeight
                        radius: Ui.Metrics.radiusControl
                        color: roles.field
                        Row {
                            id: stepper
                            x: Ui.Metrics.xs
                            Ui.EditorButton {
                                objectName: "inspector-runs-decrease"
                                density: Ui.EditorButton.Compact
                                variant: Ui.EditorButton.Flat
                                iconName: "remove"
                                iconSize: Ui.Metrics.iconSm
                                implicitWidth: Ui.Metrics.compact
                                leftPadding: Ui.Metrics.none
                                rightPadding: Ui.Metrics.none
                                accessibleName: qsTr("Decrease runs")
                                enabled: root.runs > 1 && !root.running
                                onClicked: root.runs = Math.max(1, root.runs - 1)
                            }
                            Ui.Text {
                                objectName: "inspector-runs-value"
                                anchors.verticalCenter: parent.verticalCenter
                                width: Ui.Metrics.xxl
                                horizontalAlignment: Text.AlignHCenter
                                text: String(root.runs)
                                role: Ui.Typography.SansLabel
                            }
                            Ui.EditorButton {
                                objectName: "inspector-runs-increase"
                                density: Ui.EditorButton.Compact
                                variant: Ui.EditorButton.Flat
                                iconName: "add"
                                iconSize: Ui.Metrics.iconSm
                                implicitWidth: Ui.Metrics.compact
                                leftPadding: Ui.Metrics.none
                                rightPadding: Ui.Metrics.none
                                accessibleName: qsTr("Increase runs")
                                enabled: root.runs < 32 && !root.running
                                onClicked: root.runs = Math.min(32, root.runs + 1)
                            }
                        }
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.micro
                    Ui.EditorButton {
                        id: runSelected
                        objectName: "inspector-run-selected"
                        Layout.fillWidth: true
                        variant: Ui.EditorButton.Primary
                        iconName: "playArrow"
                        text: qsTr("Run selected")
                        accessibleName: qsTr("Run selected nodes")
                        enabled: !root.running && !root.inspector.readOnly
                        onHoveredChanged: root.inspector.showToolTip(hovered ? qsTr("Run selected nodes") + "  " + (Qt.platform.os === "osx" ? "⌘ Enter" : "Ctrl+Enter") : "")
                        onClicked: root.inspector.runSelectedNodes(root.runs)
                    }
                    Ui.Text {
                        objectName: "inspector-run-progress"
                        visible: root.runProgress.total !== undefined && root.runProgress.total > 1
                        text: visible ? qsTr("Run %1/%2").arg(root.runProgress.current).arg(root.runProgress.total) : ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
        }
        // PanelRight.tsx puts the collapsed cost estimate under the inspector. Native
        // reads the per-run total from the server preflight of the saved workflow.
        Rectangle {
            visible: !!root.cost.available
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.compact + Ui.Metrics.xs * 2
            color: roles.panel
            Rectangle { width: parent.width; height: Ui.Metrics.border; color: roles.divider }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: Ui.Metrics.lg
                anchors.rightMargin: Ui.Metrics.lg
                spacing: Ui.Metrics.md
                Ui.Text { objectName: "inspector-cost-title"; text: qsTr("Cost estimate"); role: Ui.Typography.SansLabel }
                Item { Layout.fillWidth: true }
                Ui.Text { objectName: "inspector-cost-caption"; text: root.cost.caption || ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            }
        }
    }
}
