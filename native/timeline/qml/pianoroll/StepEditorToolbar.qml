// Stateless Step Editor commands and session controls.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import "PianoRollTools.js" as Tools

Rectangle {
    id: root
    required property var panel
    implicitHeight: Ui.Metrics.standard
    color: Ui.Theme.surfacePanel
    readonly property bool editable: panel.midi.editable && !panel.gestureActive
    readonly property bool selected: panel.selectedIds.length > 0
    readonly property var tools: [
        {
            tool: "pointer",
            label: qsTr("Pointer"),
            icon: "toolSelect"
        },
        {
            tool: "pencil",
            label: qsTr("Pencil"),
            icon: "editOutlined"
        },
        {
            tool: "line",
            label: qsTr("Line"),
            icon: "showChart"
        },
        {
            tool: "eraser",
            label: qsTr("Eraser"),
            icon: "deleteOutline"
        }
    ]
    readonly property var laneEntries: [
        {
            id: "newController",
            label: qsTr("New Controller Lane"),
            enabled: editable,
            submenu: [
                {
                    id: "cc:7",
                    label: qsTr("Volume")
                },
                {
                    id: "cc:1",
                    label: qsTr("Modulation")
                },
                {
                    id: "cc:10",
                    label: qsTr("Pan")
                },
                {
                    id: "cc:11",
                    label: qsTr("Expression")
                },
                {
                    id: "cc:64",
                    label: qsTr("Sustain")
                },
                {
                    id: "pitchBend",
                    label: qsTr("Pitch Bend")
                },
                {
                    id: "channelPressure",
                    label: qsTr("Channel Pressure")
                },
                {
                    id: "otherCc",
                    label: qsTr("Other CC...")
                }
            ]
        },
        {
            id: "newNote",
            label: qsTr("New Note Lane"),
            enabled: editable
        },
        {
            id: "deleteLane",
            label: qsTr("Delete Lane"),
            enabled: editable && panel.laneSet === "automatic" && !!panel.selectedLane
        }
    ]
    readonly property var editEntries: [
        {
            id: "undo",
            label: qsTr("Undo"),
            enabled: !panel.gestureActive && !!panel.undoStack && panel.undoStack.canUndo
        },
        {
            id: "redo",
            label: qsTr("Redo"),
            enabled: !panel.gestureActive && !!panel.undoStack && panel.undoStack.canRedo
        },
        {
            separator: true
        },
        {
            id: "delete",
            label: qsTr("Delete"),
            enabled: editable && selected
        },
        {
            id: "selectAll",
            label: qsTr("Select All"),
            enabled: !panel.gestureActive
        },
        {
            id: "deselectAll",
            label: qsTr("Deselect All"),
            enabled: !panel.gestureActive
        }
    ]
    readonly property var functionEntries: [
        {
            id: "scale",
            label: qsTr("Scale Values"),
            enabled: editable && selected
        },
        {
            id: "set",
            label: qsTr("Set to Value"),
            enabled: editable && selected
        },
        {
            id: "thin",
            label: qsTr("Thin Out"),
            enabled: editable && selected
        }
    ]
    readonly property var viewEntries: [
        {
            id: "inspector",
            label: qsTr("Lane Inspector"),
            checked: panel.inspectorVisible
        },
        {
            id: "catch",
            label: qsTr("Catch Playhead"),
            checked: panel.catchOn
        },
        {
            id: "link",
            label: qsTr("Link"),
            checked: panel.linkOn
        }
    ]
    function toolEntries(current) {
        return tools.map(entry => ({
                    id: entry.tool,
                    label: entry.label,
                    icon: entry.icon,
                    checked: entry.tool === current
                }));
    }
    Flickable {
        anchors.fill: parent
        contentWidth: controls.width
        contentHeight: height
        flickableDirection: Flickable.HorizontalFlick
        clip: true
        Row {
            id: controls
            height: parent.height
            spacing: Ui.Metrics.sm
            leftPadding: Ui.Metrics.md
            rightPadding: Ui.Metrics.md
            Trigger {
                text: qsTr("Lanes")
                menu: laneMenu
                Ui.ContextMenu {
                    id: laneMenu
                    entries: root.laneEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            Trigger {
                text: qsTr("Edit")
                menu: editMenu
                Ui.ContextMenu {
                    id: editMenu
                    entries: root.editEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            Trigger {
                text: qsTr("Functions")
                menu: functionsMenu
                Ui.ContextMenu {
                    id: functionsMenu
                    entries: root.functionEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            Trigger {
                text: qsTr("View")
                menu: viewMenu
                Ui.ContextMenu {
                    id: viewMenu
                    entries: root.viewEntries
                    onEntryTriggered: id => root.panel.runAction(id)
                }
            }
            Ui.ToolbarIconButton {
                anchors.verticalCenter: parent.verticalCenter
                iconName: "myLocation"
                accessibleName: qsTr("Catch")
                active: root.panel.catchOn
                iconColor: active ? Ui.Theme.statusInfo : undefined
                onClicked: root.panel.catchOn = !root.panel.catchOn
            }
            Ui.ToolbarIconButton {
                anchors.verticalCenter: parent.verticalCenter
                iconName: "link"
                accessibleName: qsTr("Link")
                active: root.panel.linkOn
                iconColor: active ? Ui.Theme.statusWarning : undefined
                onClicked: root.panel.linkOn = !root.panel.linkOn
            }
            Trigger {
                accessibleName: qsTr("Left-click tool: %1").arg(root.tools.find(entry => entry.tool === root.panel.tool).label)
                iconName: root.tools.find(entry => entry.tool === root.panel.tool).icon
                menu: toolMenu
                Ui.ContextMenu {
                    id: toolMenu
                    entries: root.toolEntries(root.panel.tool)
                    onEntryTriggered: id => root.panel.tool = id
                }
            }
            Trigger {
                accessibleName: (Qt.platform.os === "osx" ? qsTr("Cmd-click tool: %1") : qsTr("Ctrl-click tool: %1")).arg(root.tools.find(entry => entry.tool === root.panel.altTool).label)
                iconName: root.tools.find(entry => entry.tool === root.panel.altTool).icon
                menu: altMenu
                Ui.ContextMenu {
                    id: altMenu
                    entries: root.toolEntries(root.panel.altTool)
                    onEntryTriggered: id => root.panel.altTool = id
                }
            }
            Ui.Text {
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.panelWidth * 0.7
                role: Ui.Typography.MonoLabel
                text: root.panel.positionText
            }
            Ui.Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "unfoldMore"
                tone: Ui.Text.Secondary
            }
            Ui.Slider {
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.xxxl * 2
                accessibleName: qsTr("Vertical Zoom")
                from: 0.75
                to: 3
                value: root.panel.rowZoom
                onValuePreviewed: value => root.panel.rowZoom = value
                onValueCommitted: value => root.panel.rowZoom = value
            }
            Ui.Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: "swapHoriz"
                tone: Ui.Text.Secondary
            }
            Ui.Slider {
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.xxxl * 2
                accessibleName: qsTr("Horizontal Zoom")
                from: 0
                to: 1
                value: Tools.zoomToSlider(root.panel.pxPerTick, 0.002, 1)
                onValuePreviewed: value => root.panel.pxPerTick = Tools.sliderToZoom(value, 0.002, 1)
                onValueCommitted: value => root.panel.pxPerTick = Tools.sliderToZoom(value, 0.002, 1)
            }
        }
    }
    component Trigger: Ui.MenuButton {
        anchors.verticalCenter: parent.verticalCenter
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
    }
}
