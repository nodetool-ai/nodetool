import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline

Basic.ComboBox {
    id: control
    implicitHeight: Theme.controlSm
    implicitWidth: Math.max(Theme.controlSm * 3, implicitContentWidth + leftPadding + rightPadding)
    leftPadding: Theme.spacingMd
    rightPadding: Theme.iconSm + Theme.spacingMd * 2
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    hoverEnabled: true
    contentItem: Text {
        text: control.displayText
        font: control.font
        color: control.enabled ? Theme.textPrimary : Theme.textDisabled
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    indicator: Icon {
        x: control.width - width - Theme.spacingMd
        y: (control.height - height) / 2
        size: Theme.iconSm
        path: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"
        color: control.enabled ? Theme.textSecondary : Theme.textDisabled
    }
    background: Rectangle {
        color: control.down ? Theme.actionSelected : control.hovered ? Theme.actionHover : "transparent"
        radius: Theme.radiusMd
        border.color: control.activeFocus ? Theme.primary : Theme.divider
    }
    delegate: Basic.ItemDelegate {
        required property var model
        required property int index
        width: ListView.view.width
        height: Theme.controlSm
        highlighted: control.highlightedIndex === index
        contentItem: Text {
            text: control.textRole ? parent.model[control.textRole] : parent.model.modelData
            font: control.font
            color: Theme.textPrimary
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: Theme.radiusSm
            color: parent.highlighted ? Theme.actionSelected : parent.hovered ? Theme.actionHover : "transparent"
        }
    }
    popup: Basic.Popup {
        y: control.height + Theme.spacingXs
        width: control.width
        implicitHeight: Math.min(contentItem.implicitHeight + topPadding + bottomPadding, Theme.controlSm * 10)
        padding: Theme.spacingXs
        contentItem: ListView {
            clip: true
            implicitHeight: contentHeight
            model: control.popup.visible ? control.delegateModel : null
            currentIndex: control.highlightedIndex
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: PanelScrollBar {}
        }
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusLg }
    }
}
