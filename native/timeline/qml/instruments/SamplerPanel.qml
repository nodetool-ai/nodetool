// Compact multisample sampler panel for the timeline (drop target, waveform
// with loop markers, root note, one-shot/loop toggle, amp ADSR, zone list for
// multiple zones). Built exclusively with NodeTool.UiPrimitives per
// native/ui_primitives/DESIGN.md.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    objectName: "samplerPanel"

    property TimelineModel timeline: null
    property string trackId: ""
    property string projectDir: ""
    property bool readOnly: false
    property var instrument: ({})

    property string selectedZoneId: ""
    property var waveformPeaks: []
    property bool dropActive: false
    property string pendingRequestId: ""
    property int requestCounter: 0

    signal parameterCommitted(string name, var value)
    signal zoneActionCommitted(string action, var payload)

    readonly property var activeInstrument: {
        if (root.timeline && root.trackId !== "") {
            const tracks = root.timeline.tracksJson
            if (tracks) {
                for (let i = 0; i < tracks.length; ++i) {
                    if (tracks[i].id === root.trackId && tracks[i].instrument) {
                        return tracks[i].instrument
                    }
                }
            }
        }
        return root.instrument || ({})
    }

    readonly property var zones: Array.isArray(activeInstrument.zones) ? activeInstrument.zones : []
    readonly property int selectedZoneIndex: {
        if (zones.length === 0) return -1
        for (let i = 0; i < zones.length; ++i) {
            if (String(zones[i].id || "") === root.selectedZoneId) return i
        }
        return 0
    }
    readonly property var selectedZone: selectedZoneIndex >= 0 ? zones[selectedZoneIndex] : null

    readonly property bool instrumentOneShot: activeInstrument.oneShot === true
    readonly property string loopModeValue: {
        if (selectedZone && selectedZone.loopMode) {
            return String(selectedZone.loopMode)
        }
        return instrumentOneShot ? "oneShot" : "sustain"
    }
    readonly property bool isLoopMode: loopModeValue === "sustain"
    readonly property int rootNoteValue: selectedZone ? intOr(selectedZone.rootNote, 60) : 60
    readonly property real loopStartValue: selectedZone ? clamp01(numOr(selectedZone.loopStart, 0.0)) : 0.0
    readonly property real loopEndValue: selectedZone ? Math.max(loopStartValue, clamp01(numOr(selectedZone.loopEnd, 1.0))) : 1.0
    readonly property real loopCrossfadeMsValue: selectedZone ? numOr(selectedZone.loopCrossfadeMs, 10.0) : 10.0

    readonly property real attackMsValue: numOr(activeInstrument.attackMs, 2.0)
    readonly property real decayMsValue: numOr(activeInstrument.decayMs, 100.0)
    readonly property real sustainValue: numOr(activeInstrument.sustain, 1.0)
    readonly property real releaseMsValue: numOr(activeInstrument.releaseMs, 120.0)

    readonly property string selectedZoneMediaPath: selectedZone && selectedZone.mediaPath ? String(selectedZone.mediaPath) : ""

    implicitWidth: Ui.Metrics.xxxl * 12
    implicitHeight: contentColumn.implicitHeight + Ui.Metrics.md * 2

    onSelectedZoneMediaPathChanged: requestSelectedWaveform()
    Component.onCompleted: requestSelectedWaveform()

    function numOr(v, fallback) {
        const n = Number(v)
        return Number.isFinite(n) ? n : fallback
    }

    function intOr(v, fallback) {
        const n = Number(v)
        return Number.isFinite(n) ? Math.round(n) : fallback
    }

    function clamp01(v) {
        return Math.max(0.0, Math.min(1.0, v))
    }

    function toLogNorm(val, minVal, maxVal) {
        const clamped = Math.max(minVal, Math.min(maxVal, val))
        return Math.log(clamped / minVal) / Math.log(maxVal / minVal)
    }

    function fromLogNorm(norm, minVal, maxVal) {
        const t = clamp01(norm)
        return minVal * Math.pow(maxVal / minVal, t)
    }

    function formatMs(ms) {
        return ms >= 1000.0 ? (ms / 1000.0).toFixed(2) + " s" : Math.round(ms) + " ms"
    }

    function formatPct(v) {
        return Math.round(v * 100.0) + "%"
    }

    function requestSelectedWaveform() {
        if (!root.selectedZoneMediaPath) {
            root.waveformPeaks = []
            waveformCanvas.requestPaint()
            return
        }
        root.requestCounter += 1
        const reqId = "wave_" + root.requestCounter
        root.pendingRequestId = reqId
        SamplerHelper.analyzeAudioFile(reqId, root.selectedZoneMediaPath, root.projectDir)
    }

    function handleDroppedUrl(urlText) {
        if (root.readOnly || !urlText) return
        if (!SamplerHelper.isSupportedAudioFile(urlText)) return
        root.requestCounter += 1
        const reqId = "drop_" + root.requestCounter
        root.pendingRequestId = reqId
        SamplerHelper.analyzeAudioFile(reqId, urlText, root.projectDir)
    }

    AutomationController { id: live; timeline: root.timeline; trackId: root.trackId }
    function previewParam(name, value) {
        if (readOnly) return
        const patch = {}; patch[name] = value
        live.previewDevice("instrument", patch)
    }
    function cancelPreview() { live.cancelDevice("instrument") }
    onVisibleChanged: if (!visible) cancelPreview()

    function commitParam(name, value) {
        if (root.readOnly) return
        root.parameterCommitted(name, value)
        if (root.timeline && root.trackId !== "") {
            const payload = { trackId: root.trackId }
            payload[name] = value
            live.commitDevice("instrument", { [name]: value }, "sampler.setParams", payload)
        }
    }

    function commitZonePatch(patch) {
        if (root.readOnly || !root.selectedZone) return
        const payload = Object.assign({ trackId: root.trackId, zoneId: String(root.selectedZone.id || "") }, patch)
        root.zoneActionCommitted("sampler.updateZone", payload)
        if (root.timeline && root.trackId !== "") {
            root.timeline.applyEdit("sampler.updateZone", payload)
        }
    }

    function commitRemoveZone(zoneId) {
        if (root.readOnly || !zoneId) return
        const payload = { trackId: root.trackId, zoneId: zoneId }
        root.zoneActionCommitted("sampler.removeZone", payload)
        if (root.timeline && root.trackId !== "") {
            root.timeline.applyEdit("sampler.removeZone", payload)
        }
    }

    Connections {
        target: SamplerHelper
        function onFileAnalyzed(requestId, result) {
            if (!result || !result.ok) return
            if (requestId.indexOf("drop_") === 0) {
                const newId = "zone-" + root.requestCounter
                const payload = {
                    trackId: root.trackId,
                    id: newId,
                    name: String(result.name || "Sample"),
                    mediaPath: String(result.mediaPath || ""),
                    rootNote: root.intOr(result.rootNote, 60),
                    lowNote: 0,
                    highNote: 127,
                    lowVelocity: 0,
                    highVelocity: 127,
                    loopMode: root.loopModeValue
                }
                root.selectedZoneId = newId
                root.waveformPeaks = Array.isArray(result.peaks) ? result.peaks : []
                waveformCanvas.requestPaint()
                root.zoneActionCommitted("sampler.addZone", payload)
                if (root.timeline && root.trackId !== "") {
                    root.timeline.applyEdit("sampler.addZone", payload)
                }
            } else if (requestId === root.pendingRequestId) {
                root.waveformPeaks = Array.isArray(result.peaks) ? result.peaks : []
                waveformCanvas.requestPaint()
            }
        }
    }

    component ParamSliderRow: RowLayout {
        id: row
        required property string labelText
        required property string readoutText
        required property real sliderValue
        property real from: 0.0
        property real to: 1.0
        property real resetValue: 0.0
        property string sliderName: ""
        property bool controlEnabled: !root.readOnly
        signal previewed(real nextValue)
        signal committed(real nextValue)

        Layout.fillWidth: true
        spacing: Ui.Metrics.sm

        Ui.Text {
            Layout.preferredWidth: Ui.Metrics.xxxl * 2
            role: Ui.Typography.SansCaption
            tone: row.controlEnabled ? Ui.Text.Secondary : Ui.Text.Disabled
            text: row.labelText
            elide: Text.ElideRight
        }

        Ui.Slider {
            objectName: row.sliderName
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            enabled: row.controlEnabled
            from: row.from
            to: row.to
            value: row.sliderValue
            resetValue: row.resetValue
            resetOnDoubleTap: true
            accessibleName: row.labelText
            cancelOnFocusLoss: true
            onValuePreviewed: v => row.previewed(v)
            onEditCanceled: root.cancelPreview()
            onValueCommitted: v => row.committed(v)
        }

        Ui.Text {
            Layout.preferredWidth: Ui.Metrics.xxxl * 2
            role: Ui.Typography.MonoCaption
            tone: row.controlEnabled ? Ui.Text.Primary : Ui.Text.Disabled
            horizontalAlignment: Text.AlignRight
            text: row.readoutText
        }
    }

    ColumnLayout {
        id: contentColumn
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm

        Ui.PanelHeader {
            Layout.fillWidth: true
            text: qsTr("Sampler")

            Ui.Chip {
                visible: root.zones.length > 0
                text: root.zones.length === 1 ? qsTr("1 zone") : qsTr("%1 zones").arg(root.zones.length)
                variant: Ui.Chip.Tone
            }
        }

        // Drop target + waveform display with draggable loop markers.
        Ui.Surface {
            id: waveformBox
            objectName: "samplerWaveformDropTarget"
            variant: Ui.Surface.Input
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.xxxl * 3
            border.color: root.dropActive ? Ui.Theme.borderFocus : Ui.Theme.borderControl
            border.width: root.dropActive ? Ui.Metrics.focus : Ui.Metrics.border

            property real draftLoopStart: -1.0
            property real draftLoopEnd: -1.0
            readonly property real displayLoopStart: draftLoopStart >= 0.0 ? draftLoopStart : root.loopStartValue
            readonly property real displayLoopEnd: draftLoopEnd >= 0.0 ? draftLoopEnd : root.loopEndValue

            Canvas {
                id: waveformCanvas
                anchors.fill: parent
                anchors.margins: Ui.Metrics.xs

                onPaint: {
                    const ctx = getContext("2d")
                    ctx.reset()
                    const w = width
                    const h = height
                    if (w <= 0 || h <= 0) return

                    const midY = h * 0.5
                    ctx.strokeStyle = Ui.Theme.borderSubtle
                    ctx.lineWidth = Ui.Metrics.border
                    ctx.beginPath()
                    ctx.moveTo(0, midY)
                    ctx.lineTo(w, midY)
                    ctx.stroke()

                    if (root.isLoopMode && root.selectedZone) {
                        const x0 = waveformBox.displayLoopStart * w
                        const x1 = waveformBox.displayLoopEnd * w
                        ctx.save()
                        ctx.globalAlpha = 0.14
                        ctx.fillStyle = Ui.Theme.accentPrimary
                        ctx.fillRect(x0, 0, Math.max(0, x1 - x0), h)
                        ctx.restore()
                    }

                    const peaks = root.waveformPeaks
                    if (peaks && peaks.length > 0) {
                        ctx.fillStyle = Ui.Theme.accentPrimary
                        const barW = Math.max(1.0, w / peaks.length)
                        for (let i = 0; i < peaks.length; ++i) {
                            const amp = Math.max(0.02, Number(peaks[i]) || 0.0)
                            const halfBar = amp * (h * 0.44)
                            ctx.fillRect(i * barW, midY - halfBar, Math.max(1.0, barW - 0.5), halfBar * 2.0)
                        }
                    }

                    if (root.isLoopMode && root.selectedZone) {
                        const lsX = waveformBox.displayLoopStart * w
                        const leX = waveformBox.displayLoopEnd * w
                        ctx.lineWidth = Ui.Metrics.focus
                        ctx.strokeStyle = Ui.Theme.statusInfo
                        ctx.beginPath()
                        ctx.moveTo(lsX, 0)
                        ctx.lineTo(lsX, h)
                        ctx.stroke()

                        ctx.strokeStyle = Ui.Theme.statusWarning
                        ctx.beginPath()
                        ctx.moveTo(leX, 0)
                        ctx.lineTo(leX, h)
                        ctx.stroke()
                    }
                }

                Connections {
                    target: root
                    function onWaveformPeaksChanged() { waveformCanvas.requestPaint() }
                    function onIsLoopModeChanged() { waveformCanvas.requestPaint() }
                    function onLoopStartValueChanged() { waveformCanvas.requestPaint() }
                    function onLoopEndValueChanged() { waveformCanvas.requestPaint() }
                    function onSelectedZoneChanged() { waveformCanvas.requestPaint() }
                }
                Connections {
                    target: waveformBox
                    function onDisplayLoopStartChanged() { waveformCanvas.requestPaint() }
                    function onDisplayLoopEndChanged() { waveformCanvas.requestPaint() }
                }
                Connections {
                    target: Ui.Theme
                    function onEffectiveSchemeChanged() { waveformCanvas.requestPaint() }
                    function onUiScaleChanged() { waveformCanvas.requestPaint() }
                }
            }

            // Empty drop prompt when no zone is loaded.
            ColumnLayout {
                anchors.centerIn: parent
                spacing: Ui.Metrics.xs
                visible: !root.selectedZone

                Ui.Icon {
                    Layout.alignment: Qt.AlignHCenter
                    name: Ui.Icons.audio
                    size: Ui.Metrics.iconLg
                    tone: root.dropActive ? Ui.Text.Info : Ui.Text.Secondary
                }

                Ui.Text {
                    Layout.alignment: Qt.AlignHCenter
                    role: Ui.Typography.SansCaption
                    tone: root.dropActive ? Ui.Text.Info : Ui.Text.Secondary
                    text: qsTr("Drop audio file (WAV, AIFF, FLAC, MP3)")
                }
            }

            // Draggable loop start handle.
            Item {
                id: loopStartHandle
                objectName: "samplerLoopStartHandle"
                visible: root.isLoopMode && root.selectedZone !== null && !root.readOnly
                width: Ui.Metrics.md
                height: waveformCanvas.height
                x: waveformCanvas.x + waveformBox.displayLoopStart * waveformCanvas.width - width * 0.5
                y: waveformCanvas.y
                activeFocusOnTab: true
                Accessible.role: Accessible.Slider
                Accessible.name: qsTr("Loop start")

                Keys.onPressed: event => {
                    const step = (event.modifiers & Qt.ShiftModifier) ? 0.05 : 0.01
                    if (event.key === Qt.Key_Left) {
                        root.commitZonePatch({ loopStart: root.clamp01(Math.min(root.loopEndValue - 0.01, root.loopStartValue - step)) })
                        event.accepted = true
                    } else if (event.key === Qt.Key_Right) {
                        root.commitZonePatch({ loopStart: root.clamp01(Math.min(root.loopEndValue - 0.01, root.loopStartValue + step)) })
                        event.accepted = true
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    preventStealing: true
                    cursorShape: Qt.SizeHorCursor
                    onPressed: waveformBox.draftLoopStart = root.loopStartValue
                    onPositionChanged: mouse => {
                        const mapped = mapToItem(waveformCanvas, mouse.x, 0)
                        const maxStart = Math.max(0.0, waveformBox.displayLoopEnd - 0.01)
                        waveformBox.draftLoopStart = Math.max(0.0, Math.min(maxStart, mapped.x / Math.max(1.0, waveformCanvas.width)))
                    }
                    onReleased: {
                        const v = waveformBox.draftLoopStart
                        waveformBox.draftLoopStart = -1.0
                        if (v >= 0.0) root.commitZonePatch({ loopStart: v })
                    }
                    onCanceled: waveformBox.draftLoopStart = -1.0
                }
            }

            // Draggable loop end handle.
            Item {
                id: loopEndHandle
                objectName: "samplerLoopEndHandle"
                visible: root.isLoopMode && root.selectedZone !== null && !root.readOnly
                width: Ui.Metrics.md
                height: waveformCanvas.height
                x: waveformCanvas.x + waveformBox.displayLoopEnd * waveformCanvas.width - width * 0.5
                y: waveformCanvas.y
                activeFocusOnTab: true
                Accessible.role: Accessible.Slider
                Accessible.name: qsTr("Loop end")

                Keys.onPressed: event => {
                    const step = (event.modifiers & Qt.ShiftModifier) ? 0.05 : 0.01
                    if (event.key === Qt.Key_Left) {
                        root.commitZonePatch({ loopEnd: root.clamp01(Math.max(root.loopStartValue + 0.01, root.loopEndValue - step)) })
                        event.accepted = true
                    } else if (event.key === Qt.Key_Right) {
                        root.commitZonePatch({ loopEnd: root.clamp01(Math.max(root.loopStartValue + 0.01, root.loopEndValue + step)) })
                        event.accepted = true
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    preventStealing: true
                    cursorShape: Qt.SizeHorCursor
                    onPressed: waveformBox.draftLoopEnd = root.loopEndValue
                    onPositionChanged: mouse => {
                        const mapped = mapToItem(waveformCanvas, mouse.x, 0)
                        const minEnd = Math.min(1.0, waveformBox.displayLoopStart + 0.01)
                        waveformBox.draftLoopEnd = Math.max(minEnd, Math.min(1.0, mapped.x / Math.max(1.0, waveformCanvas.width)))
                    }
                    onReleased: {
                        const v = waveformBox.draftLoopEnd
                        waveformBox.draftLoopEnd = -1.0
                        if (v >= 0.0) root.commitZonePatch({ loopEnd: v })
                    }
                    onCanceled: waveformBox.draftLoopEnd = -1.0
                }
            }

            DropArea {
                id: fileDropArea
                anchors.fill: parent
                enabled: !root.readOnly
                keys: ["text/uri-list"]
                onEntered: drag => {
                    if (drag.hasUrls && drag.urls.length > 0 && SamplerHelper.isSupportedAudioFile(String(drag.urls[0]))) {
                        root.dropActive = true
                        drag.accept(Qt.CopyAction)
                    } else {
                        drag.accepted = false
                    }
                }
                onExited: root.dropActive = false
                onDropped: drop => {
                    root.dropActive = false
                    if (drop.hasUrls && drop.urls.length > 0) {
                        root.handleDroppedUrl(String(drop.urls[0]))
                    }
                }
            }
        }

        // Root note & one-shot/loop playback mode row.
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm

            Ui.Text {
                role: Ui.Typography.SansCaption
                tone: root.selectedZone && !root.readOnly ? Ui.Text.Secondary : Ui.Text.Disabled
                text: qsTr("Root")
            }

            Ui.NumberField {
                id: rootNoteField
                objectName: "samplerRootNoteField"
                Layout.preferredWidth: Ui.Metrics.xxxl * 2
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly && root.selectedZone !== null
                from: 0
                to: 127
                stepSize: 1
                value: root.rootNoteValue
                accessibleName: qsTr("Root MIDI note")
                onValueCommitted: v => root.commitZonePatch({ rootNote: Math.round(v) })
            }

            Ui.Chip {
                objectName: "samplerRootNoteChip"
                text: SamplerHelper.noteName(root.rootNoteValue)
                variant: Ui.Chip.Tone
            }

            Item { Layout.fillWidth: true }

            Ui.SegmentedControl {
                id: loopModeControl
                objectName: "samplerLoopModeControl"
                density: Ui.EditorButton.Compact
                variant: Ui.SegmentedControl.Tray
                enabled: !root.readOnly
                accessibleName: qsTr("Playback mode")
                optionNamePrefix: "samplerMode_"
                options: SamplerHelper.loopModes
                value: root.loopModeValue
                onValueCommitted: v => {
                    const nextMode = String(v)
                    if (root.selectedZone) {
                        root.commitZonePatch({ loopMode: nextMode })
                    } else {
                        root.commitParam("oneShot", nextMode === "oneShot")
                    }
                }
            }
        }

        ParamSliderRow {
            visible: root.isLoopMode && root.selectedZone !== null
            sliderName: "samplerLoopXfadeSlider"
            labelText: qsTr("Loop Xfade")
            from: 0.0
            to: 200.0
            sliderValue: root.loopCrossfadeMsValue
            resetValue: 10.0
            readoutText: root.formatMs(root.loopCrossfadeMsValue)
            onCommitted: v => root.commitZonePatch({ loopCrossfadeMs: v })
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        // Amp ADSR controls.
        ParamSliderRow {
            sliderName: "samplerAttackSlider"
            labelText: qsTr("Attack")
            sliderValue: root.toLogNorm(Math.max(0.5, root.attackMsValue), 0.5, 4000.0)
            resetValue: root.toLogNorm(2.0, 0.5, 4000.0)
            readoutText: root.formatMs(root.attackMsValue)
            onPreviewed: v => root.previewParam("attackMs", v <= 0.001 ? 0.0 : root.fromLogNorm(v, 0.5, 4000.0))
            onCommitted: v => root.commitParam("attackMs", v <= 0.001 ? 0.0 : root.fromLogNorm(v, 0.5, 4000.0))
        }

        ParamSliderRow {
            sliderName: "samplerDecaySlider"
            labelText: qsTr("Decay")
            sliderValue: root.toLogNorm(Math.max(1.0, root.decayMsValue), 1.0, 4000.0)
            resetValue: root.toLogNorm(100.0, 1.0, 4000.0)
            readoutText: root.formatMs(root.decayMsValue)
            onPreviewed: v => root.previewParam("decayMs", root.fromLogNorm(v, 1.0, 4000.0))
            onCommitted: v => root.commitParam("decayMs", root.fromLogNorm(v, 1.0, 4000.0))
        }

        ParamSliderRow {
            sliderName: "samplerSustainSlider"
            labelText: qsTr("Sustain")
            sliderValue: root.sustainValue
            resetValue: 1.0
            readoutText: root.formatPct(root.sustainValue)
            onPreviewed: v => root.previewParam("sustain", v)
            onCommitted: v => root.commitParam("sustain", v)
        }

        ParamSliderRow {
            sliderName: "samplerReleaseSlider"
            labelText: qsTr("Release")
            sliderValue: root.toLogNorm(Math.max(1.0, root.releaseMsValue), 1.0, 5000.0)
            resetValue: root.toLogNorm(120.0, 1.0, 5000.0)
            readoutText: root.formatMs(root.releaseMsValue)
            onPreviewed: v => root.previewParam("releaseMs", root.fromLogNorm(v, 1.0, 5000.0))
            onCommitted: v => root.commitParam("releaseMs", root.fromLogNorm(v, 1.0, 5000.0))
        }

        // Zone list shown only when more than one zone exists.
        Ui.Separator {
            visible: root.zones.length > 1
            Layout.fillWidth: true
        }

        ListView {
            id: zoneListView
            objectName: "samplerZoneList"
            visible: root.zones.length > 1
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(Ui.Metrics.controlCompact * 5, root.zones.length * Ui.Metrics.controlCompact)
            clip: true
            reuseItems: true
            cacheBuffer: Ui.Metrics.controlCompact * 2
            model: root.zones

            delegate: Ui.ListRow {
                id: zoneRow
                required property var modelData
                required property int index

                readonly property string zoneId: String(modelData.id || "")
                readonly property int zLow: root.intOr(modelData.lowNote, 0)
                readonly property int zHigh: root.intOr(modelData.highNote, 127)
                readonly property int zRoot: root.intOr(modelData.rootNote, 60)
                readonly property int zLowVel: root.intOr(modelData.lowVelocity, 0)
                readonly property int zHighVel: root.intOr(modelData.highVelocity, 127)

                width: zoneListView.width
                height: Ui.Metrics.controlCompact
                active: index === root.selectedZoneIndex
                onClicked: root.selectedZoneId = zoneId

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: Ui.Metrics.sm
                    anchors.rightMargin: Ui.Metrics.xs
                    spacing: Ui.Metrics.sm

                    Ui.Text {
                        Layout.fillWidth: true
                        role: Ui.Typography.SansCaption
                        tone: zoneRow.active ? Ui.Text.Primary : Ui.Text.Secondary
                        text: String(zoneRow.modelData.name || zoneRow.zoneId || qsTr("Zone"))
                        elide: Text.ElideRight
                    }

                    Ui.Text {
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                        text: SamplerHelper.noteName(zoneRow.zLow) + "-" + SamplerHelper.noteName(zoneRow.zHigh) +
                              " (" + SamplerHelper.noteName(zoneRow.zRoot) + ")"
                    }

                    Ui.Text {
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Disabled
                        text: "v" + zoneRow.zLowVel + "-" + zoneRow.zHighVel
                    }

                    Ui.CloseButton {
                        visible: !root.readOnly
                        accessibleName: qsTr("Remove zone")
                        onClicked: root.commitRemoveZone(zoneRow.zoneId)
                    }
                }
            }
        }
    }
}
