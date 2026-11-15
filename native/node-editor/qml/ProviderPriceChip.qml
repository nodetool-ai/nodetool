pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The price chip under a selected FAL or KIE card (FalPricingFooter.tsx,
// KieCreditsFooter.tsx): the list price, or "KIE credits" for a KIE node
// without one. A click opens the popover under it with the pricing lines, the
// FAL per-run estimate, the account credits and the provider links.
Item {
    id: root
    required property PriceChip chip
    readonly property int chipTone: root.chip.tone === "warning" ? Ui.Text.Warning : root.chip.tone === "info" ? Ui.Text.Info : Ui.Text.Success
    objectName: "price-chip"
    implicitWidth: Math.max(chipButton.width, root.chip.open ? popover.width : 0)
    implicitHeight: chipButton.height + (root.chip.open ? Ui.Metrics.xs + popover.height : 0)

    Ui.EditorButton {
        id: chipButton
        objectName: "price-chip-button"
        anchors.right: parent.right
        density: Ui.EditorButton.Compact
        textRole: Ui.Typography.SansCaption
        textTone: root.chipTone
        // A live price carries the web's dot before the amount.
        text: (root.chip.live ? "● " : "") + root.chip.label
        accessibleName: root.chip.label
        menuButton: true
        menuExpanded: root.chip.open
        active: root.chip.open
        onClicked: root.chip.toggle()
    }

    Rectangle {
        id: popover
        objectName: "price-chip-popover"
        visible: root.chip.open
        anchors.right: parent.right
        anchors.top: chipButton.bottom
        anchors.topMargin: Ui.Metrics.xs
        // The web popover is at least 220 px wide, and its lines wrap.
        width: Ui.Metrics.dialogCompactWidth / 2
        height: body.implicitHeight + Ui.Metrics.border * 2
        color: Ui.Theme.surfaceOverlay
        radius: Ui.Metrics.radiusOverlay
        border.width: Ui.Metrics.border
        border.color: Ui.Theme.borderControl
        Keys.onEscapePressed: root.chip.close()

        ColumnLayout {
            id: body
            x: Ui.Metrics.border
            y: Ui.Metrics.border
            width: popover.width - Ui.Metrics.border * 2
            spacing: 0

            ColumnLayout {
                Layout.fillWidth: true
                Layout.margins: Ui.Metrics.lg
                spacing: Ui.Metrics.xs
                Ui.Text {
                    visible: root.chip.detailsArePricing
                    text: root.chip.heading
                    role: Ui.Typography.SansCaption
                    tone: root.chipTone
                    font.capitalization: Font.AllUppercase
                }
                Ui.Text {
                    objectName: "price-chip-details"
                    Layout.fillWidth: true
                    text: root.chip.details
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                }
                RowLayout {
                    visible: root.chip.estimateState === "loading"
                    spacing: Ui.Metrics.sm
                    Ui.BusyIndicator { running: parent.visible; tone: Ui.Text.Secondary }
                    Ui.Text { text: "Loading estimate…"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                }
                Ui.Text {
                    objectName: "price-chip-estimate"
                    visible: root.chip.estimateState === "ready"
                    Layout.fillWidth: true
                    text: root.chip.estimate
                    role: Ui.Typography.SansLabel
                    wrapMode: Text.Wrap
                }
            }
            Ui.Separator { Layout.fillWidth: true }
            ColumnLayout {
                Layout.fillWidth: true
                Layout.margins: Ui.Metrics.lg
                spacing: Ui.Metrics.xs
                Ui.Text {
                    text: "Account credits"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    font.capitalization: Font.AllUppercase
                }
                RowLayout {
                    visible: root.chip.creditsState === "loading"
                    spacing: Ui.Metrics.sm
                    Ui.BusyIndicator { running: parent.visible; tone: Ui.Text.Secondary }
                    Ui.Text { text: "Loading…"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                }
                Ui.Text {
                    objectName: "price-chip-credits"
                    visible: root.chip.creditsState !== "loading"
                    Layout.fillWidth: true
                    text: root.chip.creditsState === "" ? "—" : root.chip.credits
                    role: root.chip.creditsState === "ok" ? Ui.Typography.SansLabel : Ui.Typography.SansCaption
                    tone: root.chip.creditsState === "ok" ? Ui.Text.Success : root.chip.creditsState === "unavailable" ? Ui.Text.Warning : Ui.Text.Disabled
                    wrapMode: Text.Wrap
                }
                Ui.EditorButton {
                    objectName: "price-chip-keys"
                    visible: root.chip.keysUrl !== ""
                    text: root.chip.keysLabel
                    trailingIconName: "openInNew"
                    density: Ui.EditorButton.Compact
                    onClicked: root.chip.openLink(root.chip.keysUrl)
                }
            }
            Ui.Separator { Layout.fillWidth: true }
            Repeater {
                model: root.chip.links
                delegate: Ui.MenuItem {
                    required property var modelData
                    required property int index
                    objectName: "price-chip-link-" + index
                    Layout.fillWidth: true
                    text: modelData.label
                    iconName: "openInNew"
                    onTriggered: root.chip.openLink(modelData.url)
                }
            }
            Item { Layout.preferredHeight: Ui.Metrics.xs }
        }
    }
}
