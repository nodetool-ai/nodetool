import QtQuick
import NodeTool.UiPrimitives as Ui
import QtQuick.Controls.Basic as Basic

Basic.Button {
    id: root
    enum Density { Compact, Standard, Comfortable }
    enum Variant { Default, Primary, Flat, Destructive }
    property int contentAlignment: Qt.AlignHCenter
    property string providerEntry: ""
    property string iconName: ""
    property string trailingIconName: ""
    property bool menuButton: false
    property bool menuExpanded: false
    property int textTone: !enabled ? Ui.Text.Disabled : (variant === 1 || variant === 3) ? Ui.Text.OnAccent : Ui.Text.Primary
    property int iconTone: !enabled ? Ui.Text.Disabled : (variant === 1 || variant === 3) ? Ui.Text.OnAccent : Ui.Text.Primary
    property string accessibleName: text
    property int density: 1
    property int variant: 0
    property bool active: false
    property bool loading: false
    property string disabledReason: ""
    property string shortcutText: ""
    property string description: ""
    property int textRole: Typography.SansLabel
    Accessible.role: Accessible.Button
    Accessible.name: accessibleName
    Accessible.expandable: menuButton
    Accessible.expanded: menuButton && menuExpanded
    Accessible.description: !enabled && disabledReason !== "" ? disabledReason : description
    Accessible.onPressAction: { if (!loading && enabled) click() }
    onDensityChanged: if (density < 0 || density > 2) { console.warn("Invalid button density"); density = 1 }
    onVariantChanged: if (variant < 0 || variant > 3) { console.warn("Invalid button variant"); variant = 0 }
    onTextRoleChanged: if (!Number.isInteger(textRole) || textRole < Typography.SansTitle || textRole > Typography.MonoCaption) { console.warn("Invalid button text role"); textRole = Typography.SansLabel }
    onLoadingChanged: if (loading && down) pressCancel.cancel(root)
    implicitHeight: Math.max(density === 0 ? Metrics.compact :
        density === 2 ? Metrics.comfortable : Metrics.standard,
        (label.visible ? label.implicitHeight : Math.max(buttonIcon.visible ? buttonIcon.height : 0, provider.visible ? provider.height : 0, spinner.visible ? spinner.height : 0)) + Metrics.md)
    implicitWidth: Math.max(implicitHeight, content.naturalWidth + leftPadding + rightPadding)
    leftPadding: display === Basic.AbstractButton.IconOnly ? Metrics.sm : Metrics.lg
    rightPadding: leftPadding
    font.family: Typography.family(textRole)
    font.pixelSize: Typography.pixelSize(textRole)
    font.weight: Typography.weight(textRole)
    contentItem: Item {
        implicitWidth: content.naturalWidth
        implicitHeight: content.implicitHeight
        Row {
        id: content
        readonly property real iconWidth: (buttonIcon.visible ? buttonIcon.width : 0) + (provider.visible ? provider.width : 0) + (spinner.visible ? spinner.width : 0)
        readonly property real trailingWidth: trailingIcon.visible ? trailingIcon.width : 0
        readonly property int visibleCount: (iconWidth > 0 ? 1 : 0) + (label.visible ? 1 : 0) + (trailingWidth > 0 ? 1 : 0)
        readonly property real naturalWidth: iconWidth + trailingWidth + (label.visible ? label.implicitWidth : 0) + Math.max(0, visibleCount - 1) * spacing
        width: Math.min(naturalWidth, parent.width)
        x: root.contentAlignment === Qt.AlignLeft ? 0 : root.contentAlignment === Qt.AlignRight ? parent.width - width : (parent.width - width) / 2
        anchors.verticalCenter: parent.verticalCenter
        spacing: Metrics.sm
        layoutDirection: root.mirrored ? Qt.RightToLeft : Qt.LeftToRight
        Ui.Icon { id: buttonIcon; anchors.verticalCenter: parent.verticalCenter; visible: !root.loading && root.providerEntry === "" && root.iconName !== "" && root.display !== Basic.AbstractButton.TextOnly; name: root.iconName; tone: root.iconTone }
        Ui.ProviderIcon { id: provider; anchors.verticalCenter: parent.verticalCenter; visible: !root.loading && root.providerEntry !== "" && root.display !== Basic.AbstractButton.TextOnly; entry: root.providerEntry; tone: root.iconTone }
        Ui.BusyIndicator { id: spinner; anchors.verticalCenter: parent.verticalCenter; visible: root.loading; running: visible; width: Metrics.iconSm; height: width; tone: (root.variant === 1 || root.variant === 3) ? Ui.Text.OnAccent : Ui.Text.Primary }
        // A proportional line height leaves its slack under the glyphs, which pushes a one-line label above center.
        Ui.Text { id: label; objectName: "nativeButtonLabel"; lineHeight: 1; width: Math.max(0, Math.min(implicitWidth, content.width - content.iconWidth - content.trailingWidth - Math.max(0, content.visibleCount - 1) * content.spacing)); anchors.verticalCenter: parent.verticalCenter; text: root.text; visible: text !== "" && root.display !== Basic.AbstractButton.IconOnly; role: root.textRole; tone: root.textTone; elide: Text.ElideRight }
        Ui.Icon { id: trailingIcon; objectName: "nativeButtonTrailingIcon"; anchors.verticalCenter: parent.verticalCenter; visible: root.trailingIconName !== "" && root.display !== Basic.AbstractButton.IconOnly; name: root.trailingIconName; tone: root.iconTone }
    }
    }
    background: Rectangle {
        radius: Metrics.radiusControl
        color: !root.enabled ? Theme.actionDisabled : root.variant === 3 ? (root.down || root.hovered ? Theme.destructiveHover : Theme.destructivePrimary) : root.variant === 1 ? (root.down || root.hovered ? Theme.accentHover : Theme.accentPrimary) : root.down ? Theme.actionPressed : root.checked || root.active ? Theme.actionSelected : root.hovered ? Theme.actionHover : root.variant === 2 ? "transparent" : Theme.surfacePanel
        border.width: root.visualFocus ? Metrics.focus : Metrics.border
        border.color: root.visualFocus ? Theme.borderFocus : root.variant === 2 || root.variant === 1 || root.variant === 3 ? "transparent" : Theme.borderControl
    }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if ((loading && event.key === Qt.Key_Space) || event.key === Qt.Key_Return || event.key === Qt.Key_Enter)
            event.accepted = true
    }
    Keys.onReleased: event => {
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            event.accepted = true
            if (enabled && !loading && !event.isAutoRepeat) click()
        } else if (loading && event.key === Qt.Key_Space) event.accepted = true
    }
    MouseArea { anchors.fill: parent; z: 1; visible: root.loading; enabled: root.loading }
    Ui.PressCancel { id: pressCancel }
    Item {
        id: disabledTarget
        parent: root.parent
        x: root.x; y: root.y; width: root.width; height: root.height
        z: root.z + Metrics.layerOverlay
        visible: !root.enabled && root.disabledReason !== ""
        HoverHandler { id: disabledHover }
    }
    Ui.Tooltip {
        id: tooltip
        objectName: "nativeButtonTooltip"
        trigger: root
        visible: (root.hovered || root.visualFocus || disabledHover.hovered) && (root.description !== "" || root.disabledReason !== "" || root.shortcutText !== "" || root.display === Basic.AbstractButton.IconOnly)
        text: !root.enabled && root.disabledReason !== "" ? root.disabledReason : root.accessibleName + (root.shortcutText !== "" ? " (" + root.shortcutText + ")" : "") + (root.description !== "" && root.description.trim() !== root.accessibleName.trim() ? "\n" + root.description : "")
    }
}
