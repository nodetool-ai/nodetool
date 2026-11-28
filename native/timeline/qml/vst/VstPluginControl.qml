pragma ComponentBehavior: Bound
// Shared VST3 plug-in picker and editor launcher for both MIDI track
// instruments (`instrumentMode: true`) and audio/MIDI/master track insert
// effects (`instrumentMode: false`).
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property bool instrumentMode: false
    property string instanceId: ""
    property string editorTitle: ""
    // Current plugin ref ({uid, name, vendor, path}) or null.
    // JSON data from the document, controller, or shared JavaScript API.
    property var plugin: null
    // Base64 state string or null/empty.
    property string pluginState: ""
    // Effect wet/dry mix in [0, 1] (effect mode) or instrument gainDb (instrument mode).
    property real wet: 1.0
    property real gainDb: 0.0
    property bool disabled: false
    // False when a device menu chose the plug-in, so the device shows no second picker.
    property bool showPicker: true
    signal parameterPreviewed(var patch)
    signal editCanceled()
    signal pluginChosen(var pluginRef)
    signal wetChangedRequested(real value)
    signal gainDbChangedRequested(real value)

    spacing: Ui.Metrics.sm

    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var pluginList: instrumentMode ? VstHost.instruments : VstHost.effects
    readonly property string selectedKey: plugin && plugin.path && plugin.uid ? (plugin.path + "\n" + plugin.uid) : ""
    readonly property bool editorOpen: instanceId !== "" && VstHost.openEditors.indexOf(instanceId) >= 0

    // JSON records consumed by the shared registry, menu, or control API.
    readonly property var selectOptions: {
        const opts = [{ value: "", label: instrumentMode ? qsTr("Choose VST3 instrument…") : qsTr("Choose VST3 effect…") }]
        let foundCurrent = selectedKey === ""
        for (let i = 0; i < pluginList.length; ++i) {
            const p = pluginList[i]
            const key = p.key || (p.path + "\n" + p.uid)
            if (key === selectedKey) foundCurrent = true
            const label = p.vendor ? (p.name + " · " + p.vendor) : p.name
            opts.push({ value: key, label: label })
        }
        if (!foundCurrent && plugin && plugin.name) {
            const missingLabel = (plugin.vendor ? (plugin.name + " · " + plugin.vendor) : plugin.name) + qsTr(" (not installed)")
            opts.push({ value: selectedKey, label: missingLabel })
        }
        return opts
    }

    Component.onCompleted: {
        if (VstHost.available && !VstHost.scanned && !VstHost.scanning) {
            VstHost.scan(false)
        }
    }

    Ui.Status {
        objectName: "vst-unavailable"
        width: parent.width
        visible: !VstHost.available
        status: Ui.Status.Warning
        message: VstHost.statusReason
    }

    Row {
        width: parent.width
        spacing: Ui.Metrics.xs
        visible: VstHost.available

        Ui.Select {
            id: pluginSelect
            objectName: "vst-plugin-select"
            visible: root.showPicker
            width: visible ? Math.max(80, parent.width - rescanBtn.width - Ui.Metrics.xs) : 0
            density: Ui.EditorButton.Compact
            accessibleName: root.instrumentMode ? qsTr("VST3 instrument") : qsTr("VST3 effect plug-in")
            enabled: !root.disabled && !VstHost.scanning
            options: root.selectOptions
            value: root.selectedKey
            onValueCommitted: key => {
                if (!key) {
                    if (root.editorOpen) VstHost.closeEditor(root.instanceId)
                    root.pluginChosen(null)
                    return
                }
                for (let i = 0; i < root.pluginList.length; ++i) {
                    const p = root.pluginList[i]
                    const pKey = p.key || (p.path + "\n" + p.uid)
                    if (pKey === key) {
                        if (root.editorOpen) VstHost.closeEditor(root.instanceId)
                        root.pluginChosen({ uid: p.uid, name: p.name, vendor: p.vendor, path: p.path })
                        return
                    }
                }
            }
        }

        Ui.ToolbarIconButton {
            id: rescanBtn
            objectName: "vst-rescan"
            anchors.verticalCenter: parent.verticalCenter
            iconName: "refresh"
            accessibleName: qsTr("Rescan VST3 plug-ins")
            description: VstHost.scanning ? qsTr("Scanning VST3 folders…") : qsTr("Rescan installed VST3 plug-ins")
            enabled: !VstHost.scanning
            onClicked: VstHost.scan(true)
        }
    }

    Ui.Text {
        width: parent.width
        visible: VstHost.available && (VstHost.scanning || (VstHost.scanned && root.pluginList.length === 0))
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
        text: VstHost.scanning
            ? qsTr("Scanning VST3 plug-in folders…")
            : (root.instrumentMode ? qsTr("No VST3 instruments found in system VST3 folders.")
                                   : qsTr("No VST3 audio effects found in system VST3 folders."))
    }

    Ui.EditorButton {
        objectName: "vst-open-editor"
        width: parent.width
        visible: VstHost.available
        density: Ui.EditorButton.Compact
        variant: root.editorOpen ? Ui.EditorButton.Primary : Ui.EditorButton.Standard
        iconName: "tune"
        text: root.editorOpen ? qsTr("Close plug-in editor") : qsTr("Open plug-in editor")
        enabled: !root.disabled && root.selectedKey !== ""
        onClicked: {
            if (root.editorOpen) {
                VstHost.closeEditor(root.instanceId)
            } else if (root.plugin && root.plugin.path && root.plugin.uid) {
                VstHost.openEditor(
                    root.instanceId,
                    root.plugin.path,
                    root.plugin.uid,
                    root.pluginState ? String(root.pluginState) : "",
                    root.editorTitle || root.plugin.name || "VST3 Plug-in"
                )
            }
        }
    }

    InspectorSliderRow {
        cancelOnFocusLoss: true
        objectName: "vst-wet-slider"
        width: parent.width
        visible: !root.instrumentMode
        label: qsTr("Mix")
        min: 0
        max: 1
        step: 0.01
        disabled: root.disabled
        value: root.wet
        display: Math.round(root.wet * 100) + "%"
        onPreview: v => root.parameterPreviewed({wet: Math.round(v * 100) / 100})
        onCanceled: root.editCanceled()
        onChange: v => root.wetChangedRequested(Math.round(v * 100) / 100)
    }

    InspectorSliderRow {
        cancelOnFocusLoss: true
        objectName: "vst-gain-slider"
        width: parent.width
        visible: root.instrumentMode
        label: qsTr("Gain")
        min: -24
        max: 12
        step: 0.5
        disabled: root.disabled
        value: root.gainDb
        display: (root.gainDb > 0 ? "+" : "") + root.gainDb.toFixed(1) + " dB"
        onPreview: v => root.parameterPreviewed({gainDb: Math.round(v * 2) / 2})
        onCanceled: root.editCanceled()
        onChange: v => root.gainDbChangedRequested(Math.round(v * 2) / 2)
    }

    Ui.Text {
        objectName: "vst-error"
        width: parent.width
        visible: VstHost.lastError !== ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Error
        wrapMode: Text.WordWrap
        text: VstHost.lastError
    }
}
