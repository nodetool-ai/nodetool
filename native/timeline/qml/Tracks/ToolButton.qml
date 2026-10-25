// Mirrors ToolButton of web/src/components/timeline/ToolToggle.tsx: a 28 px
// ghost button, icon plus label (label hidden when compact or iconOnly).
// Active: action.selected and the primary colour. The tooltip shows the
// label, the shortcut of the keyboard layout in parentheses and a one-line
// description.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: button
    property string label
    property string shortcut
    property string description
    property bool active: false
    property bool compact: false
    property bool iconOnly: false
    property string iconPath
    // A monoline tool glyph (ToolGlyph) instead of a filled Material icon.
    property bool glyph: false
    signal clicked()

    readonly property bool showLabel: !compact && !iconOnly
    readonly property string heading: shortcut !== "" ? label + " (" + shortcut + ")" : label

    implicitWidth: showLabel ? Theme.spacingSm + icon.width + Theme.spacingXs + text.implicitWidth + Theme.spacingMd
                             : 28
    implicitHeight: 28                                  // CONTROL.height.sm
    width: Math.max(28, implicitWidth)
    height: implicitHeight
    radius: Theme.radiusMd                              // CONTROL.radius
    color: active ? Theme.actionSelected : hover.hovered ? Theme.actionHover : "transparent"
    Accessible.role: Accessible.Button
    Accessible.name: label

    readonly property color contentColor: active ? Theme.primary : hover.hovered ? Theme.textPrimary : Theme.textSecondary

    Row {
        id: content
        x: button.showLabel ? Theme.spacingSm : Math.round((button.width - width) / 2)
        anchors.verticalCenter: parent.verticalCenter
        spacing: Theme.spacingXs
        Icon {
            id: icon
            anchors.verticalCenter: parent.verticalCenter
            path: button.iconPath
            stroke: button.glyph
            color: button.contentColor
            size: Theme.iconSm
        }
        Text {
            id: text
            visible: button.showLabel
            anchors.verticalCenter: parent.verticalCenter
            text: button.label
            color: button.contentColor
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
        }
    }

    HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
    TapHandler { onTapped: button.clicked() }

    // Tooltip, after the hover delay.
    Timer {
        id: tipDelay
        interval: 500
        running: hover.hovered
    }
    Rectangle {
        objectName: "toolTip"
        visible: hover.hovered && !tipDelay.running
        z: 100
        y: button.height + Theme.spacingXs
        x: Math.min(0, (button.width - width) / 2)
        width: Math.min(260, Math.max(tipHeading.implicitWidth, tipDescription.implicitWidth) + 2 * Theme.spacingMd)
        height: tipColumn.implicitHeight + 2 * Theme.spacingXs
        radius: Theme.radiusSm
        color: "#2b2d31"
        Column {
            id: tipColumn
            x: Theme.spacingMd
            y: Theme.spacingXs
            width: parent.width - 2 * Theme.spacingMd
            Text {
                id: tipHeading
                width: parent.width
                wrapMode: Text.WordWrap
                text: button.heading
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
            Text {
                id: tipDescription
                visible: button.description !== ""
                width: parent.width
                wrapMode: Text.WordWrap
                text: button.description
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
        }
    }
}
