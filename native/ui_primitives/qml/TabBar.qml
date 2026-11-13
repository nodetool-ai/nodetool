pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// A row of tabs that switch a view: label, optional icon and count, and an
// unavailable reason. The caller owns `value` and updates it from
// `valueCommitted`. Arrow keys move focus between tabs, Enter and Space choose.
Item {
    id: root
    enum Appearance { Underline, Filled }
    // Entries: {label, value, iconName?, count?, active?, enabled?, disabledReason?, objectName?}.
    // `active` overrides the comparison of `value`, for strips whose tabs toggle independently.
    property var tabs: []
    property var value
    property string accessibleName: ""
    // Underline marks the chosen tab with an accent line. Filled marks it with a
    // selected background and an accent icon, in a strip that fills its height.
    property int appearance: TabBar.Underline
    signal valueCommitted(var value)
    readonly property bool filled: appearance === TabBar.Filled
    implicitWidth: tabRow.implicitWidth
    implicitHeight: Ui.Metrics.compact
    Accessible.role: Accessible.PageTabList
    Accessible.name: accessibleName
    onAppearanceChanged: if (appearance < 0 || appearance > 1) { console.warn("Invalid tab bar appearance"); appearance = 0 }

    function tabEnabled(tab) { return tab.enabled !== false && (tab.disabledReason === undefined || tab.disabledReason === "") }
    function tabActive(tab) { return tab.active !== undefined ? tab.active : tab.value === value }
    // The chosen tab, or the first enabled one, is the tab stop.
    function tabStop(index) {
        for (let i = 0; i < tabs.length; ++i) {
            if (tabActive(tabs[i]) && tabEnabled(tabs[i])) return i === index
        }
        for (let i = 0; i < tabs.length; ++i) {
            if (tabEnabled(tabs[i])) return i === index
        }
        return false
    }
    function focusTab(from, key) {
        let target = -1
        if (key === Qt.Key_Home || key === Qt.Key_End) {
            const step = key === Qt.Key_Home ? 1 : -1
            for (let i = key === Qt.Key_Home ? 0 : tabs.length - 1; i >= 0 && i < tabs.length; i += step) {
                if (tabEnabled(tabs[i])) { target = i; break }
            }
        } else {
            const step = key === Qt.Key_Right ? 1 : -1
            for (let i = from + step; i >= 0 && i < tabs.length; i += step) {
                if (tabEnabled(tabs[i])) { target = i; break }
            }
        }
        const item = target >= 0 ? repeater.itemAt(target) : null
        if (item) item.forceFocus()
    }

    Row {
        id: tabRow
        height: parent.height
        spacing: root.filled ? 0 : Ui.Metrics.md
        Repeater {
            id: repeater
            // Count-only model: delegates stay alive while entries change, so focus and hover survive a state change.
            model: root.tabs.length
            delegate: Item {
                id: cell
                required property int index
                readonly property var modelData: index < root.tabs.length ? root.tabs[index] : ({})
                readonly property bool active: root.tabActive(modelData)
                readonly property bool available: root.tabEnabled(modelData)
                readonly property string label: modelData.label !== undefined ? modelData.label : ""
                readonly property string iconName: modelData.iconName !== undefined ? modelData.iconName : ""
                readonly property string disabledReason: modelData.disabledReason !== undefined ? modelData.disabledReason : ""
                readonly property bool hasCount: modelData.count !== undefined
                objectName: modelData.objectName !== undefined ? modelData.objectName : ""
                height: tabRow.height
                width: root.filled ? content.implicitWidth + Ui.Metrics.lg * 2 : content.implicitWidth + Ui.Metrics.sm
                function forceFocus() { button.forceActiveFocus() }
                Accessible.role: Accessible.PageTab
                Accessible.name: label
                Accessible.description: disabledReason
                Accessible.checkable: true
                Accessible.checked: active
                Accessible.onPressAction: if (available) root.valueCommitted(modelData.value)
                // A disabled control receives no hover, so the reason hangs on the cell.
                HoverHandler { id: hover }
                Basic.AbstractButton {
                    id: button
                    anchors.fill: parent
                    anchors.topMargin: root.filled ? Ui.Metrics.micro : 0
                    anchors.bottomMargin: root.filled ? Ui.Metrics.micro : 0
                    enabled: cell.available
                    focusPolicy: root.tabStop(cell.index) ? Qt.StrongFocus : Qt.ClickFocus
                    Accessible.ignored: true
                    leftPadding: 0; rightPadding: 0; topPadding: 0; bottomPadding: 0
                    contentItem: Item {}
                    background: Rectangle {
                        color: !root.filled ? "transparent" : button.down ? Ui.Theme.actionPressed : cell.active ? Ui.Theme.actionSelected : button.hovered && button.enabled ? Ui.Theme.actionHover : "transparent"
                        radius: Ui.Metrics.radiusControl
                        border.width: button.visualFocus ? Ui.Metrics.focus : 0
                        border.color: Ui.Theme.borderFocus
                    }
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Left || event.key === Qt.Key_Right || event.key === Qt.Key_Home || event.key === Qt.Key_End) {
                            root.focusTab(cell.index, event.key)
                            event.accepted = true
                        } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                            button.clicked()
                            event.accepted = true
                        }
                    }
                    onClicked: root.valueCommitted(cell.modelData.value)
                }
                Row {
                    id: content
                    anchors.centerIn: root.filled ? parent : undefined
                    anchors.verticalCenter: root.filled ? undefined : parent.verticalCenter
                    anchors.verticalCenterOffset: root.filled ? 0 : -Ui.Metrics.micro
                    spacing: Ui.Metrics.sm
                    Ui.Icon {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: cell.iconName !== ""
                        name: cell.iconName
                        size: Ui.Metrics.iconSm
                        tone: cell.active ? Ui.Text.Primary : Ui.Text.Disabled
                        domainColor: cell.active ? Ui.Theme.accentPrimary : undefined
                    }
                    Ui.Text {
                        anchors.verticalCenter: root.filled ? parent.verticalCenter : undefined
                        text: cell.label
                        role: Ui.Typography.SansLabel
                        font.weight: Font.Normal
                        lineHeight: 1
                        tone: root.filled ? (cell.available ? Ui.Text.Secondary : Ui.Text.Disabled) : (cell.active ? Ui.Text.Primary : Ui.Text.Secondary)
                    }
                    Ui.Text {
                        objectName: cell.objectName === "" ? "" : cell.objectName + "-count"
                        anchors.verticalCenter: root.filled ? parent.verticalCenter : undefined
                        y: root.filled ? 0 : Ui.Metrics.micro
                        visible: cell.hasCount && (!root.filled || cell.modelData.count > 0)
                        text: cell.hasCount ? cell.modelData.count : ""
                        role: Ui.Typography.SansCaption
                        lineHeight: 1
                        tone: Ui.Text.Secondary
                        domainColor: !root.filled && cell.active ? Ui.Theme.accentPrimary : undefined
                    }
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: Ui.Metrics.focus
                    visible: !root.filled && cell.active
                    color: Ui.Theme.accentPrimary
                }
                Ui.Tooltip {
                    trigger: cell
                    text: cell.disabledReason
                    visible: hover.hovered && cell.disabledReason !== "" && !cell.available
                }
            }
        }
    }
}
