import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: root
    property string subtitle: ""
    property string placeholderIcon: "categoryOutlined"
    property Component preview: null
    property color badgeInk: Theme.accentPrimary
    implicitWidth: Metrics.touch * 3 + Metrics.lg
    implicitHeight: width + labels.implicitHeight + Metrics.xl
    leftPadding: Metrics.none
    rightPadding: Metrics.none
    topPadding: Metrics.none
    bottomPadding: Metrics.none
    checkable: false
    contentItem: ColumnLayout {
        spacing: Metrics.none
        Item {
            Layout.fillWidth: true
            implicitHeight: width
            Ui.Surface {
                anchors.fill: parent
                variant: Ui.Surface.Canvas
            }
            Ui.Icon {
                anchors.centerIn: parent
                name: root.placeholderIcon
                size: Metrics.xxxl
                tone: Ui.Text.Disabled
                visible: !root.preview
            }
            Loader {
                anchors.fill: parent
                // The preview is decoration. Disabling it keeps pointer and focus on the card.
                enabled: false
                sourceComponent: root.preview
            }
        }
        ColumnLayout {
            id: labels
            Layout.fillWidth: true
            Layout.margins: Metrics.md
            spacing: Metrics.micro
            Ui.Text {
                Layout.fillWidth: true
                text: root.text
                role: Typography.SansLabel
                elide: Text.ElideRight
            }
            Ui.Surface {
                implicitWidth: badge.implicitWidth + Metrics.md
                implicitHeight: badge.implicitHeight + Metrics.xs
                radius: Metrics.radiusPill
                Ui.Text {
                    id: badge
                    anchors.centerIn: parent
                    text: root.subtitle
                    role: Typography.SansCaption
                    domainColor: root.badgeInk
                }
            }
        }
    }
    Rectangle {
        anchors.fill: parent
        z: Metrics.layerOverlay
        color: "transparent"
        radius: Metrics.radiusCard
        border.width: root.visualFocus || root.checked ? Metrics.focus : Metrics.border
        border.color: root.visualFocus || root.checked ? Theme.borderFocus : Theme.borderControl
    }
    background: Rectangle {
        radius: Metrics.radiusCard
        color: !root.enabled ? Theme.actionDisabled : root.down ? Theme.actionPressed : root.hovered ? Theme.actionHover : Theme.surfacePanel
        border.width: root.visualFocus || root.checked ? Metrics.focus : Metrics.border
        border.color: root.visualFocus || root.checked ? Theme.borderFocus : Theme.borderControl
    }
}
