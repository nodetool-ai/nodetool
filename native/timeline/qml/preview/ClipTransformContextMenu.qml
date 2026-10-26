import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Menu {
    id: menu
    objectName: "clipTransformContextMenu"
    signal action(string name)
    width: 200
    padding: Theme.spacingXs
    modal: true
    focus: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 60 } }
    exit: Transition { NumberAnimation { property: "opacity"; from: 1; to: 0; duration: 40 } }
    background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }

    component TransformMenuItem: MenuItem {
        id: entry
        required property string actionName
        required property string iconPath
        property bool verticalIcon: false
        property string shortcut: ""
        objectName: "gizmoAction_" + actionName
        height: Theme.rulerHeight
        Accessible.name: text
        contentItem: Item {
            implicitHeight: Theme.rulerHeight
            Icon {
                id: glyph
                x: Theme.spacingMd
                anchors.verticalCenter: parent.verticalCenter
                path: entry.iconPath
                color: Theme.textPrimary
                rotation: entry.verticalIcon ? 90 : 0
            }
            Text {
                x: glyph.x + glyph.width + Theme.spacingLg
                anchors.verticalCenter: parent.verticalCenter
                text: entry.text
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
            }
            Text {
                anchors.right: parent.right
                anchors.rightMargin: Theme.spacingMd
                anchors.verticalCenter: parent.verticalCenter
                text: entry.shortcut
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmall
            }
        }
        background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
        onTriggered: { menu.action(actionName); menu.close() }
    }
    component TransformSeparator: MenuSeparator {
        padding: 0
        contentItem: Rectangle { implicitHeight: 1; color: Theme.divider }
    }
    Label {
        text: qsTr("Transform")
        height: Theme.rulerHeight
        leftPadding: Theme.spacingLg
        verticalAlignment: Text.AlignVCenter
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        font.weight: Font.Medium
        color: Theme.textSecondary
    }
    TransformMenuItem {
        actionName: "reset"
        text: qsTr("Reset")
        iconPath: "M12 5V2L8 6l4 4V7c3.31 0 6 2.69 6 6 0 2.97-2.17 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93 0-4.42-3.58-8-8-8m-6 8c0-1.65.67-3.15 1.76-4.24L6.34 7.34C4.9 8.79 4 10.79 4 13c0 4.08 3.05 7.44 7 7.93v-2.02c-2.83-.48-5-2.94-5-5.91"
        shortcut: "."
    }
    TransformSeparator {}
    TransformMenuItem {
        actionName: "rotate180"
        text: qsTr("Rotate 180°")
        iconPath: "M4.64 19.37c3.03 3.03 7.67 3.44 11.15 1.25l-1.46-1.46c-2.66 1.43-6.04 1.03-8.28-1.21-2.73-2.73-2.73-7.17 0-9.9C7.42 6.69 9.21 6.03 11 6.03V9l4-4-4-4v3.01c-2.3 0-4.61.87-6.36 2.63-3.52 3.51-3.52 9.21 0 12.73M11 13l6 6 6-6-6-6z"
    }
    TransformMenuItem {
        actionName: "rotate90CW"
        text: qsTr("Rotate 90° CW")
        iconPath: "M15.55 5.55 11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03m3.89-2.42 1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48"
    }
    TransformMenuItem {
        actionName: "rotate90CCW"
        text: qsTr("Rotate 90° CCW")
        iconPath: "M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47M6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47m1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93"
    }
    TransformSeparator {}
    TransformMenuItem {
        actionName: "flipHorizontal"
        text: qsTr("Flip horizontal")
        iconPath: "M15 21h2v-2h-2zm4-12h2V7h-2zM3 5v14c0 1.1.9 2 2 2h4v-2H5V5h4V3H5c-1.1 0-2 .9-2 2m16-2v2h2c0-1.1-.9-2-2-2m-8 20h2V1h-2zm8-6h2v-2h-2zM15 5h2V3h-2zm4 8h2v-2h-2zm0 8c1.1 0 2-.9 2-2h-2z"
    }
    TransformMenuItem {
        actionName: "flipVertical"
        text: qsTr("Flip vertical")
        iconPath: "M15 21h2v-2h-2zm4-12h2V7h-2zM3 5v14c0 1.1.9 2 2 2h4v-2H5V5h4V3H5c-1.1 0-2 .9-2 2m16-2v2h2c0-1.1-.9-2-2-2m-8 20h2V1h-2zm8-6h2v-2h-2zM15 5h2V3h-2zm4 8h2v-2h-2zm0 8c1.1 0 2-.9 2-2h-2z"
        verticalIcon: true
    }
}
