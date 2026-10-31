import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Window {
    id: window
    width: galleryWidth; height: 620; visible: true; color: Ui.Theme.surfaceCanvas
    title: "Native UI primitives"
    function flowFits(flow) {
        for (const item of flow.children) {
            if (item.visible && (item.x < -0.5 || item.x + item.width > flow.width + 0.5)) return false
        }
        return true
    }
    function boundsValid() { return flowFits(titleFlow) && flowFits(actionFlow) && flowFits(fieldsFlow) && flowFits(metricsFlow) }
    Component.onCompleted: { Ui.Theme.reducedMotion = true; Ui.Theme.uiScale = galleryUiScale; Ui.Theme.textScale = galleryTextScale; Ui.Theme.preference = galleryLight ? Ui.Theme.Light : Ui.Theme.Dark }
    Flickable {
        anchors.fill: parent; clip: true
        contentWidth: width; contentHeight: content.height + 2 * Ui.Metrics.xxl
        Basic.ScrollBar.vertical: Ui.ScrollBar {}
        Column {
            id: content
            x: Ui.Metrics.xxl; y: Ui.Metrics.xxl
            width: Math.max(0, parent.width - 2 * Ui.Metrics.xxl)
            spacing: Ui.Metrics.lg
            LayoutMirroring.enabled: galleryRtl
            LayoutMirroring.childrenInherit: true
            Flow {
                id: titleFlow
                width: parent.width; spacing: Ui.Metrics.md
                Ui.Text { objectName: "galleryTitle"; text: "Native UI primitives"; role: Ui.Typography.SansTitle; width: Math.min(implicitWidth, content.width); elide: Text.ElideRight }
                Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Switch theme"; onClicked: Ui.Theme.preference = Ui.Theme.dark ? Ui.Theme.Light : Ui.Theme.Dark }
            }
            Ui.Text { text: "Typography, actions, fields, and state"; role: Ui.Typography.SansBody; tone: Ui.Text.Secondary; width: parent.width; wrapMode: Text.Wrap }
            Ui.Surface {
                width: parent.width; height: actionFlow.height + 2 * Ui.Metrics.lg
                Flow {
                    id: actionFlow
                    x: Ui.Metrics.lg; y: Ui.Metrics.lg; width: parent.width - 2 * Ui.Metrics.lg; spacing: Ui.Metrics.md
                    Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Primary"; variant: Ui.EditorButton.Primary }
                    Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Default"; iconName: "add" }
                    Ui.ToolbarIconButton { width: Math.min(implicitWidth, parent.width); text: "Search"; accessibleName: text; iconName: "search" }
                    Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Disabled"; enabled: false; disabledReason: "Unavailable" }
                    Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Loading"; loading: true }
                    Ui.EditorButton { width: Math.min(implicitWidth, parent.width); text: "Selected"; checkable: true; checked: true }
                }
            }
            Flow {
                id: fieldsFlow
                width: parent.width; spacing: Ui.Metrics.lg
                Ui.TextField { width: Math.min(200, parent.width); value: "A field"; accessibleName: "Example" }
                Ui.NumberField { width: Math.min(180, parent.width); value: 12; unit: "px"; accessibleName: "Size" }
                Ui.TextField { width: Math.min(200, parent.width); value: "Invalid"; valid: false; errorText: "Check value"; accessibleName: "Invalid example" }
                Ui.TextField { width: Math.min(200, parent.width); value: "Read only"; readOnly: true; accessibleName: "Read only example" }
                Ui.Select { width: 160; accessibleName: "Choice"; options: [{label: "First", value: 1}, {label: "Second", value: 2}]; value: 1 }
                Ui.Toggle { width: Math.min(implicitWidth, parent.width); text: "Enabled"; checked: true }
                Ui.BusyIndicator { accessibleName: "Loading" }
                Ui.Status { width: Math.min(implicitWidth, parent.width); status: Ui.Status.Success; message: "Saved" }
                Ui.Progress { width: Math.min(implicitWidth, parent.width); value: 0.6; accessibleName: "Progress" }
            }
            Flow {
                id: metricsFlow
                width: parent.width; spacing: Ui.Metrics.xl
                Ui.TextArea { width: Math.min(240, parent.width); height: Math.max(110, implicitHeight); value: "Selectable text and a longer translated label."; accessibleName: "Example text" }
                Ui.Slider { width: 160; value: 0.6; accessibleName: "Amount" }
                Ui.Fader { width: 64; height: 130; value: 0.6; accessibleName: "Volume"; marks: [{position: 1, label: "+6"}, {position: 0, label: "−∞"}] }
                Ui.LevelMeter { width: 24; height: 130; levels: [0.7, 0.45]; held: [0.8, 0.6]; clipped: [false, false]; accessibleName: "Output level" }
            }
            Repeater {
                model: [Ui.Typography.SansTitle, Ui.Typography.SansBody, Ui.Typography.SansLabel, Ui.Typography.SansCaption, Ui.Typography.MonoCode, Ui.Typography.MonoStrong, Ui.Typography.MonoLabel, Ui.Typography.MonoCaption]
                delegate: Ui.Text { required property int modelData; role: modelData; width: content.width; text: "Inter / JetBrains Mono  •  0123456789"; elide: Text.ElideRight }
            }
        }
    }
}
