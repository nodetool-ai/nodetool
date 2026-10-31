import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
    id: sheet
    objectName: "preferencesDialog"
    required property Preferences preferences
    signal providersRequested()
    title: "Settings"
    width: Math.min(parent.width - Ui.Metrics.dialogNarrowInset * 2, Ui.Metrics.dialogWidth)
    height: Math.min(parent.height - Ui.Metrics.dialogNarrowInset * 2, implicitHeight)
    modal: true
    focus: true
    closePolicy: Basic.Popup.CloseOnEscape
    onOpened: preferences.refreshDevices()
    contentItem: Basic.ScrollView {
        id: scroller
        clip: true
        contentWidth: availableWidth
        Basic.ScrollBar.horizontal.policy: Basic.ScrollBar.AlwaysOff
        Column {
        width: scroller.availableWidth
        spacing: Ui.Metrics.md
        InspectorSection {
            title: "Appearance"
            width: parent.width
            InspectorRow {
                label: "Theme"
                width: parent.width
                InspectorSelect {
                    objectName: "themePreference"
                    label: "Theme"
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
                    value: sheet.preferences.themePreference
                    options: [{label: "System", value: "System"}, {label: "Dark", value: "Dark"}, {label: "Light", value: "Light"}]
                    onChange: value => sheet.preferences.themePreference = value
                }
            }
            InspectorRow {
                label: "Interface scale"
                width: parent.width
                InspectorSelect {
                    objectName: "uiScale"
                    label: "Interface scale"
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
                    value: String(sheet.preferences.uiScale)
                    options: [{label: "75%", value: "0.75"}, {label: "100%", value: "1"},
                        {label: "125%", value: "1.25"}, {label: "150%", value: "1.5"},
                        {label: "175%", value: "1.75"}, {label: "200%", value: "2"}]
                    onChange: value => sheet.preferences.uiScale = Number(value)
                }
            }
            InspectorRow {
                label: "Text scale"
                width: parent.width
                InspectorSelect {
                    objectName: "textScale"
                    label: "Text scale"
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
                    value: String(sheet.preferences.textScale)
                    options: [{label: "100%", value: "1"}, {label: "125%", value: "1.25"},
                        {label: "150%", value: "1.5"}, {label: "175%", value: "1.75"},
                        {label: "200%", value: "2"}]
                    onChange: value => sheet.preferences.textScale = Number(value)
                }
            }
            InspectorRow {
                label: "Motion"
                width: parent.width
                InspectorSelect {
                    objectName: "motionPreference"
                    label: "Motion"
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
                    value: sheet.preferences.motionPreference
                    options: [{label: "System", value: "System"}, {label: "Reduce motion", value: "Reduce"},
                        {label: "Full motion", value: "Full"}]
                    onChange: value => sheet.preferences.motionPreference = value
                }
            }
        }
        Ui.EditorButton {
            objectName: "openProviderSettings"
            text: "Providers…"
            variant: Ui.EditorButton.Flat
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
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
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
                    width: Math.max(0, Math.min(Ui.Metrics.dialogWidth / 2, parent.width) - reset.implicitWidth - Ui.Metrics.xs)
                    ariaLabel: "Cache folder"
                    allowEmpty: true
                    placeholder: "Built-in default"
                    value: sheet.preferences.cacheFolder
                    onCommit: value => sheet.preferences.cacheFolder = value
                }
                Ui.EditorButton {
                    id: reset
                    objectName: "resetCacheFolder"
                    text: "Reset to default"
                    variant: Ui.EditorButton.Flat
                    onClicked: sheet.preferences.cacheFolder = ""
                }
            }
            InspectorRow {
                label: "Cache budget (MB)"
                width: parent.width
                InspectorPillInput {
                    objectName: "cacheBudgetMb"
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
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
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
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
                    width: Math.min(Ui.Metrics.dialogWidth / 2, parent.width)
                    value: sheet.preferences.audioDevice
                    options: sheet.preferences.playbackDevices
                    onChange: value => sheet.preferences.audioDevice = value
                }
            }
        }
        Ui.Text {
            width: parent.width
            text: "System motion follows the device setting where available. Otherwise, full motion is used.\nCache folder, cache budget, decoder and audio device apply on the next launch. A cache budget of 0 or less disables eviction."
            wrapMode: Text.WordWrap
            tone: Ui.Text.Secondary
            role: Ui.Typography.SansLabel
        }
        Ui.EditorButton {
            objectName: "closePreferences"
            text: "Close"
            anchors.right: parent.right
            variant: Ui.EditorButton.Flat
            onClicked: sheet.close()
        }
        }
    }
}
