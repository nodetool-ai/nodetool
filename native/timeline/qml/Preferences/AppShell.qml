import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: shell
    objectName: "appShell"
    anchors.fill: parent
    Preferences { id: settingsStore; objectName: "shellPreferences" }
    Binding {
        target: Ui.Theme
        property: "preference"
        value: settingsStore.themePreference === "Light" ? Ui.Theme.Light
             : settingsStore.themePreference === "Dark" ? Ui.Theme.Dark : Ui.Theme.System
    }
    Binding {
        target: Ui.Theme
        property: "systemScheme"
        value: settingsStore.systemScheme === "Light" ? Ui.Theme.Light
             : settingsStore.systemScheme === "Dark" ? Ui.Theme.Dark : Ui.Theme.Unknown
    }
    Binding { target: Ui.Theme; property: "uiScale"; value: settingsStore.uiScale }
    Binding { target: Ui.Theme; property: "textScale"; value: settingsStore.textScale }
    Binding { target: Ui.Theme; property: "reducedMotion"; value: settingsStore.reducedMotion }
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
