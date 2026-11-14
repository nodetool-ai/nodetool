pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// An exclusive choice among a few options. The caller owns `value` and updates
// it from `valueCommitted`. Arrow keys move the choice, as in a radio group.
Item {
    id: root
    enum Variant { Buttons, Tray }
    // Entries: {label, value, iconName?, enabled?, reason?, objectName?}.
    property var options: []
    property var value
    property string accessibleName: ""
    property int density: Ui.EditorButton.Compact
    // Buttons: separate buttons, the chosen one primary. Tray: joined flat
    // options in one bordered tray, the chosen one filled.
    property int variant: SegmentedControl.Buttons
    property string optionNamePrefix: ""
    property color trayColor: Ui.Theme.actionHover
    property color trayBorderColor: Ui.Theme.borderSubtle
    signal valueCommitted(var value)
    readonly property bool tray: variant === SegmentedControl.Tray
    readonly property real trayHeight: density === Ui.EditorButton.Compact ? Ui.Metrics.compact : density === Ui.EditorButton.Comfortable ? Ui.Metrics.comfortable : Ui.Metrics.standard
    implicitWidth: row.implicitWidth + (tray ? Ui.Metrics.border * 2 : 0)
    implicitHeight: tray ? trayHeight : row.implicitHeight
    Accessible.role: Accessible.Grouping
    Accessible.name: accessibleName
    onVariantChanged: if (variant < 0 || variant > 1) { console.warn("Invalid segmented control variant"); variant = 0 }

    function optionEnabled(option) { return option.enabled !== false }
    function optionName(option) { return option.objectName !== undefined ? option.objectName : optionNamePrefix + option.value }
    // The checked option, or the first enabled one, is the tab stop.
    function tabStop(index) {
        for (let i = 0; i < options.length; ++i) {
            if (options[i].value === value && optionEnabled(options[i])) return i === index
        }
        for (let i = 0; i < options.length; ++i) {
            if (optionEnabled(options[i])) return i === index
        }
        return false
    }
    function commit(index) {
        if (index < 0 || index >= options.length || !optionEnabled(options[index])) return
        valueCommitted(options[index].value)
    }
    // Selects the next enabled option in a direction. Returns true when a key was handled.
    function handleKey(key, index) {
        let target = -1
        if (key === Qt.Key_Right || key === Qt.Key_Down || key === Qt.Key_Left || key === Qt.Key_Up) {
            const step = (key === Qt.Key_Right || key === Qt.Key_Down) ? 1 : -1
            for (let i = index + step; i >= 0 && i < options.length; i += step) {
                if (optionEnabled(options[i])) { target = i; break }
            }
        } else if (key === Qt.Key_Home || key === Qt.Key_End) {
            const step = key === Qt.Key_Home ? 1 : -1
            for (let i = key === Qt.Key_Home ? 0 : options.length - 1; i >= 0 && i < options.length; i += step) {
                if (optionEnabled(options[i])) { target = i; break }
            }
        } else {
            return false
        }
        if (target >= 0 && target !== index) {
            commit(target)
            const item = repeater.itemAt(target)
            if (item) { if (item.forceFocus) item.forceFocus(); else item.forceActiveFocus() }
        }
        return true
    }

    Rectangle {
        anchors.fill: parent
        visible: root.tray
        radius: Ui.Metrics.radiusControl
        color: root.trayColor
        border.width: Ui.Metrics.border
        border.color: root.trayBorderColor
    }
    Row {
        id: row
        anchors.centerIn: root.tray ? parent : undefined
        spacing: root.tray ? 0 : Ui.Metrics.xs
        Repeater {
            id: repeater
            model: root.options
            delegate: root.tray ? trayOption : buttonOption
        }
    }
    // The tray clips its options to the rounded border.
    clip: tray

    Component {
        id: buttonOption
        Ui.EditorButton {
            id: button
            required property int index
            required property var modelData
            objectName: root.optionName(modelData)
            text: modelData.label
            iconName: modelData.iconName !== undefined ? modelData.iconName : ""
            density: root.density
            enabled: root.optionEnabled(modelData)
            disabledReason: modelData.reason !== undefined ? modelData.reason : ""
            active: root.value === modelData.value
            variant: active ? Ui.EditorButton.Primary : Ui.EditorButton.Default
            focusPolicy: root.tabStop(index) ? Qt.StrongFocus : Qt.ClickFocus
            Accessible.role: Accessible.RadioButton
            Accessible.checkable: true
            Accessible.checked: active
            Keys.onPressed: event => { if (root.handleKey(event.key, button.index)) event.accepted = true }
            onClicked: root.commit(index)
        }
    }
    Component {
        id: trayOption
        Item {
            id: cell
            required property int index
            required property var modelData
            readonly property bool checked: root.value === modelData.value
            readonly property bool available: root.optionEnabled(modelData)
            readonly property string reason: modelData.reason !== undefined ? modelData.reason : ""
            objectName: root.optionName(modelData)
            implicitWidth: content.implicitWidth + Ui.Metrics.sm * 2
            implicitHeight: root.trayHeight
            function forceFocus() { button.forceActiveFocus() }
            Accessible.role: Accessible.RadioButton
            Accessible.name: modelData.label
            Accessible.checkable: true
            Accessible.checked: checked
            Accessible.description: reason
            Accessible.onPressAction: if (available) root.commit(index)
            // A disabled control receives no hover, so the reason hangs on the cell.
            HoverHandler { id: hover }
            Basic.AbstractButton {
                id: button
                objectName: cell.objectName + "-button"
                anchors.fill: parent
                enabled: cell.available
                focusPolicy: root.tabStop(cell.index) ? Qt.StrongFocus : Qt.ClickFocus
                Accessible.ignored: true
                leftPadding: 0; rightPadding: 0; topPadding: 0; bottomPadding: 0
                contentItem: Item {}
                background: Rectangle {
                    color: button.down ? Ui.Theme.actionPressed : cell.checked ? Ui.Theme.actionSelected : button.hovered && button.enabled ? Ui.Theme.actionHover : "transparent"
                    radius: Ui.Metrics.radiusControl
                    border.width: button.visualFocus ? Ui.Metrics.focus : 0
                    border.color: Ui.Theme.borderFocus
                }
                Keys.onPressed: event => {
                    if (root.handleKey(event.key, cell.index)) event.accepted = true
                    else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) { root.commit(cell.index); event.accepted = true }
                }
                onClicked: root.commit(cell.index)
            }
            Row {
                id: content
                anchors.centerIn: parent
                spacing: Ui.Metrics.xs
                Ui.Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    visible: name !== ""
                    name: cell.modelData.iconName !== undefined ? cell.modelData.iconName : ""
                    size: Ui.Metrics.iconSm
                    tone: !cell.available ? Ui.Text.Disabled : cell.checked ? Ui.Text.Primary : Ui.Text.Secondary
                }
                Ui.Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: cell.modelData.label
                    role: Ui.Typography.SansLabel
                    font.weight: Font.Normal
                    lineHeight: 1
                    tone: !cell.available ? Ui.Text.Disabled : cell.checked ? Ui.Text.Primary : Ui.Text.Secondary
                }
            }
            Ui.Tooltip {
                trigger: cell
                text: cell.reason
                visible: hover.hovered && cell.reason !== ""
            }
        }
    }
}
