import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ApplicationWindow {
    id: window
    width: 1000
    height: 760
    visible: true
    title: qsTr("NodeTool Chat")
    color: Ui.Theme.surfaceCanvas
    Binding { target: Ui.Theme; property: "preference"; value: chatAppearance.themePreference === "Dark" ? Ui.Theme.Dark : chatAppearance.themePreference === "Light" ? Ui.Theme.Light : Ui.Theme.System }
    Binding { target: Ui.Theme; property: "systemScheme"; value: chatAppearance.systemScheme === "Dark" ? Ui.Theme.Dark : chatAppearance.systemScheme === "Light" ? Ui.Theme.Light : Ui.Theme.Unknown }
    Binding { target: Ui.Theme; property: "uiScale"; value: chatAppearance.uiScale }
    Binding { target: Ui.Theme; property: "textScale"; value: chatAppearance.textScale }
    Binding { target: Ui.Theme; property: "reducedMotion"; value: chatAppearance.reducedMotion }
    header: RowLayout {
        spacing: Ui.Metrics.md
        Item { Layout.fillWidth: true }
        Ui.ToolbarIconButton {
            id: appearanceButton
            objectName: "chatAppearanceButton"
            text: qsTr("Appearance")
            accessibleName: text
            iconName: "settings"
            onClicked: appearanceDialog.open()
        }
    }
    ChatPanel { anchors.fill: parent; session: chatSession }
    Ui.Dialog {
        id: appearanceDialog
        objectName: "chatAppearanceDialog"
        title: qsTr("Appearance")
        width: Math.min(400 * Ui.Theme.uiScale, window.width - Ui.Metrics.xl * 2)
        returnFocusTo: appearanceButton
        Flickable {
            id: appearanceScroll
            objectName: "chatAppearanceScroll"
            implicitWidth: 360 * Ui.Theme.uiScale
            implicitHeight: Math.min(appearanceContent.implicitHeight, Math.max(0, window.height - appearanceDialog.header.implicitHeight - appearanceDialog.topPadding - appearanceDialog.bottomPadding - Ui.Metrics.md * 2))
            contentWidth: width
            contentHeight: appearanceContent.implicitHeight
            clip: true
            ScrollBar.vertical: Ui.ScrollBar {}
            function ensureFocusVisible() {
                const focused = window.activeFocusItem
                if (!focused) return
                let ancestor = focused
                while (ancestor && ancestor !== appearanceContent) ancestor = ancestor.parent
                if (!ancestor) return
                const top = focused.mapToItem(appearanceContent, 0, 0).y
                if (top < contentY) contentY = top
                else if (top + focused.height > contentY + height)
                    contentY = Math.max(0, Math.min(contentHeight - height, top + focused.height - height))
            }
            onHeightChanged: Qt.callLater(ensureFocusVisible)
            onContentHeightChanged: Qt.callLater(ensureFocusVisible)
            Connections {
                target: window
                function onActiveFocusItemChanged() { Qt.callLater(appearanceScroll.ensureFocusVisible) }
            }
            ColumnLayout {
                id: appearanceContent
                width: parent.width
                spacing: Ui.Metrics.md
            Ui.Text { text: qsTr("Theme"); role: Ui.Typography.SansLabel }
            Ui.Select {
                objectName: "chatAppearanceTheme"
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                accessibleName: qsTr("Theme")
                value: chatAppearance.themePreference
                options: [{label:qsTr("System"),value:"System"},{label:qsTr("Dark"),value:"Dark"},{label:qsTr("Light"),value:"Light"}]
                onValueCommitted: selected => chatAppearance.themePreference = selected
            }
            Ui.Text { text: qsTr("Interface size"); role: Ui.Typography.SansLabel }
            Ui.Select {
                objectName: "chatAppearanceUiScale"
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                accessibleName: qsTr("Interface size")
                value: chatAppearance.uiScale
                options: [{label:"75%",value:0.75},{label:"100%",value:1},{label:"125%",value:1.25},{label:"150%",value:1.5},{label:"200%",value:2}]
                onValueCommitted: selected => chatAppearance.uiScale = selected
            }
            Ui.Text { text: qsTr("Text size"); role: Ui.Typography.SansLabel }
            Ui.Select {
                objectName: "chatAppearanceTextScale"
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                accessibleName: qsTr("Text size")
                value: chatAppearance.textScale
                options: [{label:"100%",value:1},{label:"125%",value:1.25},{label:"150%",value:1.5},{label:"200%",value:2}]
                onValueCommitted: selected => chatAppearance.textScale = selected
            }
            Ui.Text { text: qsTr("Motion"); role: Ui.Typography.SansLabel }
            Ui.Select {
                objectName: "chatAppearanceMotion"
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                accessibleName: qsTr("Motion")
                value: chatAppearance.motionPreference
                options: [{label:qsTr("System"),value:"System"},{label:qsTr("Reduce motion"),value:"Reduce"},{label:qsTr("Full motion"),value:"Full"}]
                onValueCommitted: selected => chatAppearance.motionPreference = selected
            }
                Ui.EditorButton { Layout.alignment: Qt.AlignRight; text: qsTr("Close"); onClicked: appearanceDialog.close() }
            }
        }
    }
}
