import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// The web EditorButton: 28 tall with an 11 pixel medium label. Outlined by
// default, filled when primary, and ink only when flat.
Basic.Button {
    id: root
    enum Variant { Outlined, Primary, Flat }
    property int variant: NodeButton.Outlined
    property string iconName: ""
    property string accessibleName: text
    EditorRoles { id: roles }
    Accessible.role: Accessible.Button
    Accessible.name: accessibleName
    Accessible.onPressAction: if (enabled) click()
    implicitHeight: Ui.Metrics.compact
    implicitWidth: Math.max(implicitHeight, label.implicitWidth + leftPadding + rightPadding + (glyph.visible ? glyph.width + Ui.Metrics.xs : 0) + (variant === NodeButton.Outlined ? 2 * Ui.Metrics.border : 0))
    topPadding: Ui.Metrics.xs; bottomPadding: Ui.Metrics.xs
    leftPadding: Ui.Metrics.md; rightPadding: Ui.Metrics.md
    readonly property color ink: !enabled ? roles.disabledInk : variant === NodeButton.Primary ? Ui.Theme.textOnAccent : variant === NodeButton.Flat ? Ui.Theme.textSecondary : Ui.Theme.accentPrimary
    font.family: Ui.Typography.sansFamily
    font.pixelSize: Ui.Typography.pixelSize(Ui.Typography.SansCaption)
    font.weight: Font.Medium
    contentItem: Item {
        Row {
            anchors.centerIn: parent
            spacing: Ui.Metrics.xs
            Ui.Icon { id: glyph; anchors.verticalCenter: parent.verticalCenter; visible: root.iconName !== ""; name: root.iconName; size: Ui.Metrics.iconXs; domainColor: root.ink }
            Ui.Text { id: label; objectName: "nativeButtonLabel"; anchors.verticalCenter: parent.verticalCenter; lineHeight: 1; text: root.text; role: Ui.Typography.SansCaption; font.weight: Font.Medium; domainColor: root.ink }
        }
    }
    background: Rectangle {
        radius: Ui.Metrics.radiusControl
        color: root.variant === NodeButton.Primary && root.enabled ? (root.hovered ? Ui.Theme.accentHover : Ui.Theme.accentPrimary) : root.down ? Ui.Theme.actionPressed : root.hovered && root.enabled ? Ui.Theme.actionHover : "transparent"
        border.width: root.visualFocus ? Ui.Metrics.focus : root.variant === NodeButton.Outlined ? Ui.Metrics.border : 0
        border.color: root.visualFocus ? Ui.Theme.borderFocus : root.variant === NodeButton.Primary ? Ui.Theme.textOnAccent : root.enabled ? roles.outline : roles.disabledOutline
    }
    Keys.onReturnPressed: if (enabled) click()
    Keys.onEnterPressed: if (enabled) click()
}
