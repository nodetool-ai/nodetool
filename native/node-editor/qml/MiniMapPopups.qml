import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// The two popups of the mini-map buttons (MiniMapNavigator.tsx). The editor fills
// a transparent overlay with this item, so a popup opens past the mini-map's edge.
// "colors" is the color mode menu and "legend" is the node type legend. Both
// anchor their right edge to the button and open below it.
Item {
    id: root
    property string kind: "colors"
    property string colorMode: "default"
    // Entries of { id, label, color }.
    property var legend: []
    function openAt(rightX, topY) {
        if (kind === "legend") {
            legendPopover.anchorRight = rightX
            legendPopover.y = topY
            legendPopover.open()
            legendPopover.forceActiveFocus(Qt.PopupFocusReason)
        } else {
            menu.popup(Math.max(0, rightX - menu.width), topY)
            menu.forceActiveFocus(Qt.PopupFocusReason)
        }
    }
    function choose(mode) {
        editor.setMiniMapColorMode(mode)
        editor.closeMiniMapPopup()
    }

    Ui.ContextMenu {
        id: menu
        objectName: "mini-map-color-menu"
        closePolicy: Basic.Popup.CloseOnEscape | Basic.Popup.CloseOnPressOutside
        // The web menu is 120 px wide at least.
        width: Math.max(Ui.Metrics.xxxl * 3.75, implicitWidth)
        onClosed: editor.closeMiniMapPopup()
        Ui.MenuItem {
            objectName: "mini-map-color-default"
            text: qsTr("Default colors")
            checkable: true
            checked: root.colorMode === "default"
            onTriggered: root.choose("default")
        }
        Ui.MenuItem {
            objectName: "mini-map-color-type"
            text: qsTr("Color by type")
            checkable: true
            checked: root.colorMode === "type"
            onTriggered: root.choose("type")
        }
    }

    Ui.Popover {
        id: legendPopover
        objectName: "mini-map-legend-popover"
        property real anchorRight: 0
        x: Math.max(0, Math.min(anchorRight - width, root.width - width))
        padding: Ui.Metrics.md
        onClosed: editor.closeMiniMapPopup()
        contentItem: Column {
            spacing: Ui.Metrics.xs
            Ui.Text {
                objectName: "mini-map-legend-title"
                text: qsTr("Node types")
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                font.capitalization: Font.AllUppercase
            }
            Repeater {
                model: root.legend
                delegate: Row {
                    id: entry
                    required property var modelData
                    spacing: Ui.Metrics.md
                    // The legend is 180 px wide at least, like the web's paper minWidth.
                    Rectangle {
                        objectName: "mini-map-legend-swatch-" + entry.modelData.id
                        width: Ui.Metrics.lg
                        height: Ui.Metrics.lg
                        radius: Ui.Metrics.micro
                        color: entry.modelData.color
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Ui.Text {
                        objectName: "mini-map-legend-label-" + entry.modelData.id
                        text: entry.modelData.label
                        role: Ui.Typography.SansLabel
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
            }
            Item { width: Ui.Metrics.xxxl * 5.625 - Ui.Metrics.md * 2; height: 0 }
        }
    }
}
