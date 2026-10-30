import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Dialog {
    id: sheet
    objectName: "preferencesDialog"
    required property Preferences preferences
    signal providersRequested()
    title: "Settings"
    anchors.centerIn: parent
    width: Math.min(parent.width - Theme.spacingXl * 2, Theme.trackHeaderWidth * 2)
    modal: true
    focus: true
    padding: Theme.spacingXl
    closePolicy: Popup.CloseOnEscape
    onOpened: preferences.refreshDevices()
    background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusLg }
    header: Label {
        text: sheet.title
        padding: Theme.spacingXl
        color: Theme.textPrimary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeNormal
        font.weight: Font.DemiBold
    }
    contentItem: Column {
        spacing: Theme.spacingMd
        Button {
            objectName: "openProviderSettings"
            text: "Providers…"
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            palette.button: Theme.backgroundDefault
            palette.buttonText: Theme.textPrimary
            onClicked: sheet.providersRequested()
        }
        InspectorSection {
            title: "Preferences"
            width: parent.width
            InspectorRow {
                label: "Keyboard layout"
                width: parent.width
                InspectorSelect {
                    objectName: "keyboardLayout"
                    label: "Keyboard layout"
                    width: Theme.trackHeaderWidth
                    value: sheet.preferences.keyboardLayout
                    options: [{label: "NodeTool", value: "nodetool"}, {label: "Premiere Pro", value: "premiere"}, {label: "Final Cut Pro", value: "fcp"}]
                    onChange: value => sheet.preferences.keyboardLayout = value
                }
            }
            InspectorRow {
                label: "Cache folder"
                width: parent.width
                InspectorPillInput {
                    objectName: "cacheFolder"
                    width: Theme.trackHeaderWidth - reset.implicitWidth - Theme.spacingXs
                    ariaLabel: "Cache folder"
                    allowEmpty: true
                    placeholder: "Built-in default"
                    value: sheet.preferences.cacheFolder
                    onCommit: value => sheet.preferences.cacheFolder = value
                }
                Button {
                    id: reset
                    objectName: "resetCacheFolder"
                    text: "Reset to default"
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmall
                    palette.button: Theme.backgroundDefault
                    palette.buttonText: Theme.textPrimary
                    onClicked: sheet.preferences.cacheFolder = ""
                }
            }
            InspectorRow {
                label: "Cache budget (MB)"
                width: parent.width
                InspectorPillInput {
                    objectName: "cacheBudgetMb"
                    width: Theme.trackHeaderWidth
                    ariaLabel: "Cache budget (MB)"
                    value: String(sheet.preferences.cacheBudgetMb)
                    onCommit: value => { if (Number.isFinite(Number(value))) sheet.preferences.cacheBudgetMb = Number(value) }
                }
            }
            InspectorRow {
                label: "Decoder"
                width: parent.width
                InspectorSelect {
                    objectName: "decoderMode"
                    label: "Decoder"
                    width: Theme.trackHeaderWidth
                    value: sheet.preferences.decoderMode
                    options: [{label: "Software (FFmpeg)", value: "sw"},
                        {label: "Hardware (a failure fails the clip)", value: "hw"},
                        {label: "Auto (hardware, else software)", value: "auto"}]
                    onChange: value => sheet.preferences.decoderMode = value
                }
            }
            InspectorRow {
                label: "Audio device"
                width: parent.width
                InspectorSelect {
                    objectName: "audioDevice"
                    label: "Audio device"
                    width: Theme.trackHeaderWidth
                    value: sheet.preferences.audioDevice
                    options: sheet.preferences.playbackDevices
                    onChange: value => sheet.preferences.audioDevice = value
                }
            }
        }
        Text {
            width: parent.width
            text: "Cache folder, cache budget, decoder and audio device apply on the next launch.\nA cache budget of 0 or less disables eviction."
            wrapMode: Text.WordWrap
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Button {
            objectName: "closePreferences"
            text: "Close"
            anchors.right: parent.right
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            palette.button: Theme.backgroundDefault
            palette.buttonText: Theme.textPrimary
            onClicked: sheet.close()
        }
    }
}
