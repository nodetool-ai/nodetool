// EditorButton and ToolbarIconButton share the web control sizes and radius.
import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline

Basic.Button {
    id: control
    property bool primary: false
    property bool destructive: false
    property bool quiet: false
    property bool outlined: false
    property bool round: false
    property string iconPath: ""
    property bool iconOnly: false
    readonly property color contentColor: !enabled ? Theme.textDisabled
        : primary ? Theme.textPrimary : destructive ? Theme.error : checked ? Theme.primary
        : iconOnly ? (hovered ? Theme.textPrimary : Theme.textSecondary) : Theme.textPrimary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    font.weight: Font.Medium
    implicitHeight: round ? Theme.controlSm + Theme.spacingXs : Theme.controlSm
    implicitWidth: iconOnly ? implicitHeight : Math.max(Theme.controlSm, contentItem.implicitWidth + leftPadding + rightPadding)
    padding: Theme.spacingXs
    leftPadding: iconOnly ? 0 : Theme.spacingMd
    rightPadding: iconOnly ? 0 : Theme.spacingMd
    hoverEnabled: true
    Accessible.name: text
    Basic.ToolTip.visible: iconOnly && (hovered || activeFocus)
    Basic.ToolTip.text: text
    Basic.ToolTip.delay: 500
    contentItem: Item {
        implicitWidth: (glyph.visible ? glyph.width : 0) + (caption.visible ? caption.implicitWidth : 0)
            + (glyph.visible && caption.visible ? Theme.spacingMd : 0)
        implicitHeight: Math.max(glyph.height, caption.implicitHeight)
        Icon {
            id: glyph
            anchors.verticalCenter: parent.verticalCenter
            x: control.iconOnly ? (parent.width - width) / 2 : 0
            visible: !!control.iconPath
            path: control.iconPath
            size: control.round ? Theme.iconSm + Theme.spacingMicro : Theme.iconSm
            color: control.contentColor
        }
        Text {
            id: caption
            anchors.verticalCenter: parent.verticalCenter
            x: glyph.visible ? glyph.width + Theme.spacingMd : 0
            width: Math.max(0, parent.width - x)
            visible: !control.iconOnly
            text: control.text
            font: control.font
            color: control.contentColor
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
    }
    background: Rectangle {
        radius: control.round ? width / 2 : Theme.radiusMd
        color: control.primary ? (control.enabled ? (control.hovered ? Theme.primaryDark : Theme.primary) : Theme.overlayStrong)
            : control.down || control.checked ? Theme.actionSelected
            : control.hovered && control.enabled ? Theme.actionHover : "transparent"
        border.width: control.activeFocus || (control.outlined && !control.primary && !control.quiet) ? 1 : 0
        border.color: control.activeFocus ? Theme.primary : !control.enabled ? Theme.divider : Theme.overlayStrong
    }
}
