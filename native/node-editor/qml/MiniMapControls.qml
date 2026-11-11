import QtQuick
import NodeTool.UiPrimitives as Ui

// The buttons above the mini-map's top right corner (MiniMapNavigator.tsx): the
// node type legend, shown only while the mini-map colors by type, and the color
// mode settings. Each opens a popup that the editor hosts over the window.
Item {
    id: root
    EditorRoles { id: roles }
    implicitWidth: row.implicitWidth
    implicitHeight: Ui.Metrics.small
    readonly property bool byType: editor && editor.miniMapColorMode === "type"
    component FramedButton: Rectangle {
        id: frame
        property alias button: button
        property string iconName: ""
        property string accessibleName: ""
        signal clicked
        implicitWidth: Ui.Metrics.small
        implicitHeight: Ui.Metrics.small
        color: roles.paper
        radius: Ui.Metrics.radiusControl
        border.width: Ui.Metrics.border
        border.color: roles.divider
        NodeButton {
            id: button
            anchors.fill: parent
            text: ""
            variant: NodeButton.Flat
            iconName: frame.iconName
            accessibleName: frame.accessibleName
            onClicked: frame.clicked()
        }
    }
    Row {
        id: row
        spacing: Ui.Metrics.xs
        FramedButton {
            objectName: "mini-map-legend"
            visible: root.byType
            iconName: "legendToggle"
            accessibleName: qsTr("Node type legend")
            onClicked: {
                const corner = mapToGlobal(width, height)
                editor.showMiniMapPopup("legend", corner)
            }
        }
        FramedButton {
            objectName: "mini-map-colors"
            iconName: "palette"
            accessibleName: qsTr("Color mode settings")
            onClicked: {
                const corner = mapToGlobal(width, height)
                editor.showMiniMapPopup("colors", corner)
            }
        }
    }
}
