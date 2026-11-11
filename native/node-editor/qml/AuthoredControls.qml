import QtQuick
import QtQuick.Controls as Controls
import NodeTool.UiPrimitives as Ui
import "PropertyPresets.js" as Presets

Row {
    id: root
    required property var host
    required property string resourceId
    readonly property bool menuOpen: options.visible || colors.visible
    required property bool bypassed
    required property bool hasChildren
    required property bool group
    required property var epoch
    required property var credentials
    transformOrigin: Item.TopLeft
    spacing: Ui.Metrics.sm
    function dispatch(command) { host.authoredAction(resourceId, command, epoch, credentials) }
    Ui.ToolbarIconButton {
        objectName: "group-options"
        visible: root.group
        iconName: "moreVert"
        accessibleName: "Group options"
        onClicked: options.open()
        Ui.ContextMenu {
            id: options
            width: Ui.Metrics.touch * 5
            height: (root.hasChildren ? 2 : 1) * Ui.Metrics.compact + topPadding + bottomPadding
            popupType: Controls.Popup.Window
            Ui.MenuItem {
                objectName: "group-color"
                text: "Group color"
                iconName: "paletteOutlined"
                enabled: !root.host.readOnly
                onTriggered: colors.open()
            }
            Ui.MenuItem {
                objectName: "group-bypass"
                visible: root.hasChildren
                height: visible ? implicitHeight : 0
                text: root.bypassed ? "Enable all nodes" : "Disable all nodes"
                iconName: "powerSettingsNew"
                enabled: !root.host.readOnly
                onTriggered: root.dispatch("bypass")
            }
        }
    }
    Ui.ToolbarIconButton {
        objectName: "group-run"
        visible: root.group
        iconName: "playArrow"
        // RunGroupButton.tsx: "Group is running" with a spinner while the workflow runs.
        accessibleName: root.host.shownRunActive ? "Group is running" : "Run group"
        loading: root.host.shownRunActive
        variant: Ui.EditorButton.Primary
        circular: true
        iconSize: Ui.Metrics.iconMd
        iconTone: Ui.Text.OnAccent
        enabled: !root.host.readOnly && !root.host.shownRunActive && root.host.connectionState === "Connected"
        onClicked: root.dispatch("run")
    }
    Ui.ToolbarIconButton {
        objectName: "comment-color"
        visible: !root.group
        opacity: hovered ? 1 : 0.5
        iconName: "paletteOutlined"
        accessibleName: "Choose comment color"
        enabled: !root.host.readOnly
        onClicked: colors.open()
        Ui.Popover {
            id: colors
            objectName: "comment-palette"
            popupType: Controls.Popup.Window
            width: swatches.implicitWidth + padding * 2
            height: swatches.implicitHeight + padding * 2
            contentItem: Grid {
                id: swatches
                columns: 8
                spacing: Ui.Metrics.xs
                Repeater {
                    model: Presets.colors
                    Ui.ToolbarIconButton {
                        required property var modelData
                        objectName: "comment-swatch-" + (modelData || "none")
                        width: Ui.Metrics.compact
                        height: Ui.Metrics.compact
                        accessibleName: modelData || "No color"
                        contentItem: Rectangle {
                            color: modelData || "transparent"
                            radius: Ui.Metrics.radiusPill
                            border.width: Ui.Metrics.border
                            border.color: Ui.Theme.borderControl
                        }
                        onClicked: { root.dispatch("color:" + (modelData || "")); colors.close() }
                    }
                }
            }
        }
    }
}
