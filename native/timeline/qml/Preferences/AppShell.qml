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
        onSettingsRequested: { if (!providerDialog.visible) preferencesDialog.open() }
    }
    Shortcut {
        sequence: "Ctrl+,"
        context: Qt.WindowShortcut
        enabled: !providerDialog.visible
        onActivated: preferencesDialog.open()
    }
    PreferencesDialog {
        id: preferencesDialog
        preferences: settingsStore
        onProvidersRequested: { preferencesDialog.close(); providerDialog.open() }
        onClosed: { if (!providerDialog.visible) bridge.restoreEditorFocus() }
    }
    ProviderSettingsDialog {
        id: providerDialog
        onClosed: bridge.restoreEditorFocus()
    }
    Component.onCompleted: bridge.bind()
}
