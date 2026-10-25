import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
Item {
    id: root
    property string label: ""
    property real value: 0
    property string display: String(value)
    property real min: 0
    property real max: 1
    property real step: 0.01
    property bool disabled: false
    property var origin: undefined
    property var resetValue: origin
    signal gestureStarted()
    signal preview(real value)
    signal change(real value)
    implicitHeight: Theme.controlXs
    RowLayout {
        anchors.fill: parent
        spacing: Theme.spacingSm
        Text { text: root.label; color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall }
        Slider {
            id: slider
            Layout.fillWidth: true
            from: root.min
            to: root.max
            stepSize: root.step
            value: root.value
            enabled: !root.disabled
            Accessible.name: root.label
            onPressedChanged: {
                if (pressed) root.gestureStarted()
                else root.change(value)
            }
            onMoved: {
                root.preview(value)
                if (!pressed) root.change(value)
            }
            handle: Rectangle {
                x: slider.leftPadding + slider.visualPosition * (slider.availableWidth - width)
                y: slider.topPadding + slider.availableHeight / 2 - height / 2
                width: Theme.spacingLg
                height: width
                radius: width / 2
                color: slider.enabled ? Theme.primary : Theme.actionDisabled
                border.width: slider.activeFocus ? 1 : 0
                border.color: Theme.textPrimary
            }
            background: Item {
                x: slider.leftPadding
                y: slider.topPadding + slider.availableHeight / 2 - height / 2
                width: slider.availableWidth
                height: Theme.spacingXs
                readonly property real neutral: root.origin === undefined ? 0 : (root.origin - root.min) / (root.max - root.min)
                Rectangle { anchors.fill: parent; radius: height / 2; color: Theme.overlayStrong }
                Rectangle {
                    x: Math.min(parent.neutral, slider.position) * parent.width
                    width: Math.abs(slider.position - parent.neutral) * parent.width
                    height: parent.height
                    color: Theme.primary
                    radius: height / 2
                }
                Rectangle { visible: root.origin !== undefined; x: parent.neutral * parent.width; width: 1; height: Theme.spacingMd; anchors.verticalCenter: parent.verticalCenter; color: Theme.textSecondary }
            }
            TapHandler {
                onDoubleTapped: if (root.resetValue !== undefined) root.change(root.resetValue)
            }
        }
        Text { text: root.display; color: Theme.textSecondary; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmall }
    }
}
