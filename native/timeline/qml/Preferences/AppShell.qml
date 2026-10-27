import QtQuick
import NodeTool.Timeline

Item {
    id: shell
    objectName: "appShell"
    anchors.fill: parent
    Preferences { id: settingsStore; objectName: "shellPreferences" }
    ShellPreferences {
        id: bridge
        anchor: shell
        store: settingsStore
        dialogOpen: preferencesDialog.visible
        onClosePreferencesRequested: preferencesDialog.close()
    }
    ShellMenus {
        preferences: settingsStore
        anchor: shell
        keyboardPreset: settingsStore.keyboardLayout
        onSettingsRequested: preferencesDialog.open()
    }
    Shortcut {
        sequence: "Ctrl+,"
        context: Qt.WindowShortcut
        onActivated: preferencesDialog.open()
    }
    PreferencesDialog {
        id: preferencesDialog
        preferences: settingsStore
        onClosed: bridge.restoreEditorFocus()
    }
    Component.onCompleted: bridge.bind()
}
