pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    readonly property var controller: editor.packSetup
    readonly property var categories: controller.categories
    spacing: Ui.Metrics.md
    Ui.Separator {
        Layout.fillWidth: true
    }
    Ui.EditorButton {
        id: trigger
        objectName: "catalog-optional-packs"
        Layout.fillWidth: true
        variant: Ui.EditorButton.Flat
        text: "Optional packs  " + (root.categories.filter(row => row.enabled).length > 0
            ? root.categories.filter(row => row.enabled).length + "/" + root.categories.length
            : "+" + root.categories.length)
        onClicked: {
            root.controller.refreshSecrets()
            if (root.controller.packs.length === 0) root.controller.refresh()
            popup.openAt(trigger)
        }
    }
    Ui.Popover {
        id: popup
        objectName: "optional-packs-popover"
        width: Ui.Metrics.dialogCompactWidth
        height: Math.min(content.implicitHeight + padding * 2, parent.height * 0.7)
        Basic.ScrollView {
            anchors.fill: parent
            clip: true
            contentWidth: availableWidth
            ColumnLayout {
                id: content
                width: parent.width
                spacing: Ui.Metrics.sm
                Ui.Text {
                    text: "Optional node packs"
                    role: Ui.Typography.SansLabel
                    font.weight: Font.DemiBold
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: "Advanced and niche nodes are tucked into optional packs to keep this menu focused. Turn on what you need. Search always finds every node, even when its pack is off."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.WordWrap
                }
                Ui.Separator { Layout.fillWidth: true }
                RowLayout {
                    Layout.fillWidth: true
                    Ui.Text {
                        text: "Categories"
                        role: Ui.Typography.SansLabel
                        Layout.fillWidth: true
                    }
                    Ui.EditorButton {
                        text: "Show all"
                        onClicked: root.controller.setAllCategories(true)
                    }
                    Ui.EditorButton {
                        text: "Hide all"
                        onClicked: root.controller.setAllCategories(false)
                    }
                }
                Repeater {
                    model: root.categories
                    ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        Ui.Toggle {
                            text: modelData.label
                            checked: modelData.enabled
                            onCheckedChangedByUser: checked => root.controller.setCategory(modelData.id, checked)
                        }
                        Ui.Text {
                            Layout.fillWidth: true
                            text: modelData.description
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            wrapMode: Text.WordWrap
                        }
                    }
                }
                Ui.Separator { Layout.fillWidth: true }
                Ui.Text {
                    text: "Providers"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: "Provider nodes appear once you add their API key. Configure keys on the connected server, then refresh."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.WordWrap
                }
                Repeater {
                    model: root.controller.packs.filter(pack => !pack.required && pack.requiredKey !== "")
                    RowLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        Ui.Text {
                            Layout.fillWidth: true
                            text: modelData.name
                            role: Ui.Typography.SansLabel
                        }
                        Ui.Text {
                            text: modelData.pending ? "Enabling…" : modelData.keySet ? "Key set" : "Add API key"
                            role: Ui.Typography.SansCaption
                            tone: modelData.keySet ? Ui.Text.Success : Ui.Text.Secondary
                        }
                    }
                }
                Ui.Separator { Layout.fillWidth: true }
                Ui.Text {
                    text: "Local packs"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    text: "Run locally. No API key required."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: root.controller.packs.filter(pack => !pack.required && pack.requiredKey === "")
                    ColumnLayout {
                        required property var modelData
                        Layout.fillWidth: true
                        Ui.Toggle {
                            objectName: "optional-pack-" + modelData.id
                            text: modelData.name + (modelData.pending ? " · Enabling…" : "")
                            checked: modelData.enabled
                            enabled: !modelData.pending
                            onCheckedChangedByUser: checked => root.controller.setEnabled(modelData.id, checked)
                        }
                        Ui.Text {
                            Layout.fillWidth: true
                            text: modelData.description
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            wrapMode: Text.WordWrap
                        }
                    }
                }
                Ui.Text {
                    Layout.fillWidth: true
                    visible: text !== ""
                    text: root.controller.error
                    role: Ui.Typography.SansCaption
                    wrapMode: Text.WordWrap
                }
                Ui.EditorButton {
                    objectName: "optional-packs-refresh"
                    text: "Refresh"
                    onClicked: {
                        root.controller.refresh()
                        root.controller.refreshSecrets()
                    }
                }
                Ui.EditorButton {
                    objectName: "catalog-runtimes"
                    text: "Runtimes and packs"
                    onClicked: {
                        popup.close()
                        editor.setupAction("dependencies")
                    }
                }
            }
        }
    }
}
