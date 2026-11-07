pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web Inspector: node header, Params / I/O / Help tabs, and scrolled fields.
Rectangle {
    id: root
    property var propertyHost: editor
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: 350
    property int tab: 0
    readonly property var info: propertyHost && propertyHost.selectionInfo ? propertyHost.selectionInfo : ({})
    readonly property var fieldsModel: propertyHost ? propertyHost.properties : []
    readonly property bool hasSelection: propertyHost && propertyHost.selection !== ""
    component TabButton: PanelRow {
        id: tabButton
        property int index: 0
        property var count: undefined
        implicitWidth: tabRow.implicitWidth + Ui.Metrics.sm
        implicitHeight: Ui.Metrics.compact
        active: root.tab === index
        background: Item {}
        onClicked: root.tab = index
        Row {
            id: tabRow
            anchors.verticalCenter: parent.verticalCenter
            anchors.verticalCenterOffset: -Ui.Metrics.micro
            spacing: Ui.Metrics.sm
            Ui.Text { text: tabButton.text; role: Ui.Typography.SansLabel; font.weight: Font.Normal; tone: tabButton.active ? Ui.Text.Primary : Ui.Text.Secondary; lineHeight: 1 }
            Ui.Text { y: Ui.Metrics.micro; visible: tabButton.count !== undefined; text: tabButton.count !== undefined ? tabButton.count : ""; role: Ui.Typography.SansCaption; domainColor: tabButton.active ? Ui.Theme.accentPrimary : Ui.Theme.textSecondary; lineHeight: 1 }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.focus; visible: tabButton.active; color: Ui.Theme.accentPrimary }
    }
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
                Ui.Text { objectName: "inspector-title"; Layout.fillWidth: true; text: root.info.title || (root.propertyHost ? root.propertyHost.selection : ""); role: Ui.Typography.SansLabel; font.weight: Font.Normal; elide: Text.ElideRight; lineHeight: 1.3 }
                Ui.Text { objectName: "inspector-namespace"; Layout.fillWidth: true; visible: text !== ""; text: root.info.namespace || ""; role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary; elide: Text.ElideMiddle; lineHeight: 1.3 }
            }
            NodeButton { objectName: "inspector-close"; text: ""; accessibleName: "Close inspector"; iconName: "close"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.compact; onClicked: root.propertyHost.action("Clear selection") }
        }
        Item {
            visible: root.hasSelection
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.compact
            Row {
                x: Ui.Metrics.lg
                height: parent.height
                spacing: Ui.Metrics.md
                TabButton { objectName: "tab-params"; index: 0; text: "Params"; count: root.fieldsModel.length }
                TabButton { objectName: "tab-io"; index: 1; text: "I/O"; count: (root.info.inputs ? root.info.inputs.length : 0) + (root.info.outputs ? root.info.outputs.length : 0) }
                TabButton { objectName: "tab-help"; index: 2; text: "Help" }
                TabButton { objectName: "tab-history"; index: 3; text: "History" }
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
                        host: root.propertyHost
                        nodeId: root.propertyHost ? root.propertyHost.selection : ""
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
                Loader { Layout.fillWidth: true; active: root.propertyHost && root.propertyHost.dynamicPorts !== undefined; sourceComponent: DynamicPorts { controller: root.propertyHost.dynamicPorts; enabled: !root.propertyHost.readOnly } }
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
            contentHeight: helpText.implicitHeight + Ui.Metrics.lg * 2
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
        }
        Loader {
            visible: root.hasSelection && root.tab === 3
            active: visible
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: Component { GenerationHistory { propertyHost: root.propertyHost } }
        }
        Item { visible: !root.hasSelection; Layout.fillHeight: true }
        Ui.Text {
            objectName: "inspector-message"
            visible: text !== ""
            text: root.propertyHost ? (root.propertyHost.readOnly ? root.propertyHost.readOnlyReason : root.propertyHost.message) : ""
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.WrapAnywhere
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.lg
        }
    }
}
