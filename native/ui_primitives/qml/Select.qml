pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.ComboBox {
    id: root
    property var value
    property var options: []
    property string accessibleName: ""
    property bool readOnly: false
    property bool valid: true
    property string errorText: ""
    property int density: Ui.EditorButton.Standard
    signal valueCommitted(var value)
    model: options
    textRole: "label"
    valueRole: "value"
    Accessible.name: accessibleName
    Accessible.description: valid ? "" : errorText
    Accessible.onPressAction: if (enabled && !readOnly) { forceActiveFocus(); popup.open() }
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (readOnly) {
            if (event.key !== Qt.Key_Tab && event.key !== Qt.Key_Backtab) event.accepted = true
            return
        }
        if (popup.visible) return
        const optionsCount = options.length
        let next = -1
        if (event.key === Qt.Key_Down || event.key === Qt.Key_Up) {
            const direction = event.key === Qt.Key_Down ? 1 : -1
            for (let i = currentIndex + direction; i >= 0 && i < optionsCount; i += direction) {
                if (options[i].enabled !== false) { next = i; break }
            }
        } else if (event.key === Qt.Key_Home || event.key === Qt.Key_End) {
            const direction = event.key === Qt.Key_Home ? 1 : -1
            for (let i = event.key === Qt.Key_Home ? 0 : optionsCount - 1; i >= 0 && i < optionsCount; i += direction) {
                if (options[i].enabled !== false) { next = i; break }
            }
        } else if (event.text && event.text.trim() !== "") {
            const search = event.text.toLocaleLowerCase()
            for (let offset = 1; offset <= optionsCount; ++offset) {
                const i = (currentIndex + offset + optionsCount) % optionsCount
                if (options[i].enabled !== false && String(options[i].label).toLocaleLowerCase().startsWith(search)) { next = i; break }
            }
        }
        if (next >= 0) commitIndex(next)
        if (next >= 0 || [Qt.Key_Down, Qt.Key_Up, Qt.Key_Home, Qt.Key_End].includes(event.key)) event.accepted = true
    }
    Keys.onReleased: event => {
        if (readOnly && event.key !== Qt.Key_Tab && event.key !== Qt.Key_Backtab) event.accepted = true
        if ([Qt.Key_Down, Qt.Key_Up, Qt.Key_Home, Qt.Key_End].includes(event.key)) event.accepted = true
    }
    MouseArea { anchors.fill: parent; z: 1; visible: root.readOnly; enabled: root.readOnly; onWheel: wheel => { wheel.accepted = true } }
    implicitHeight: Math.max(density === Ui.EditorButton.Compact ? Metrics.compact : Metrics.standard, label.implicitHeight + Metrics.md)
    leftPadding: Metrics.md; rightPadding: Metrics.xxl
    function synchronize() {
        for (let i = 0; i < options.length; ++i) {
            if (options[i].value === value) { currentIndex = i; return }
        }
        currentIndex = -1
    }
    function commitIndex(index) {
        const option = options[index]
        if (readOnly || !enabled || !option || option.enabled === false) return
        valueCommitted(option.value)
        Qt.callLater(synchronize)
    }
    onValueChanged: synchronize()
    onOptionsChanged: synchronize()
    onReadOnlyChanged: if (readOnly) { popup.close(); synchronize() }
    Component.onCompleted: synchronize()
    onActivated: index => commitIndex(index)
    contentItem: Ui.Text { id: label; text: root.displayText; role: Typography.SansLabel; tone: root.enabled ? Ui.Text.Primary : Ui.Text.Disabled; elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter }
    indicator: Ui.Icon { x: root.width - width - Metrics.md; y: (root.height - height) / 2; name: "arrowDropDown"; tone: root.enabled ? Ui.Text.Secondary : Ui.Text.Disabled }
    background: Rectangle {
        radius: Metrics.radiusControl; color: root.enabled ? Theme.surfaceInput : Theme.actionDisabled
        border.width: root.visualFocus ? Metrics.focus : Metrics.border
        border.color: !root.valid ? Theme.borderError : root.visualFocus ? Theme.borderFocus : Theme.borderControl
    }
    delegate: Basic.ItemDelegate {
        id: item
        required property int index
        required property var modelData
        width: root.popup.width
        enabled: !root.readOnly && root.enabled && modelData.enabled !== false
        highlighted: list.currentIndex === index
        onClicked: { root.commitIndex(index); root.popup.close() }
        contentItem: Ui.Text { text: item.modelData.label; role: Typography.SansLabel; tone: item.enabled ? Ui.Text.Primary : Ui.Text.Disabled; elide: Text.ElideRight }
        background: Rectangle { color: item.highlighted ? Theme.actionSelected : item.hovered ? Theme.actionHover : "transparent"; radius: Metrics.radiusControl }
    }
    popup: Basic.Popup {
        y: root.height; width: root.width; padding: Metrics.xs
        onClosed: root.forceActiveFocus(Qt.PopupFocusReason)
        onOpened: { if (root.readOnly) { close(); return }; list.currentIndex = root.currentIndex; list.forceActiveFocus() }
        contentItem: ListView {
            id: list
            implicitHeight: Math.min(contentHeight, Metrics.touch * 6); clip: true
            model: root.popup.visible ? root.delegateModel : null
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Down || event.key === Qt.Key_Up) {
                    const direction = event.key === Qt.Key_Down ? 1 : -1
                    let next = currentIndex
                    do { next += direction } while (next >= 0 && next < root.options.length && root.options[next].enabled === false)
                    if (next >= 0 && next < root.options.length) currentIndex = next
                    event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space) {
                    if (currentIndex >= 0 && !root.readOnly && root.options[currentIndex].enabled !== false) { root.commitIndex(currentIndex); root.popup.close() }
                    event.accepted = true
                }
            }
        }
        background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.color: Theme.borderControl; border.width: Metrics.border }
    }
}
