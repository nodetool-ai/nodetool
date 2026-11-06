// nt-panel: slot=right id=color order=5 title="Color"
// Grades the selected clip through ordinary effects, so the web editor renders the same result:
// Basic Correction is a color effect, Wheels a liftGammaGain, Curves a curves and Vignette a
// vignette. A section's switch is its effect's enabled field. This panel owns these grades, and
// Effect Controls lists them to see, enable and key them.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../../src/edit/clipeffects" as ClipEffects
import "../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog
import "../../src/edit/inspectorsections" as Sections
import "ColorWheelMath.js" as WheelMath
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "colorPanel"
    implicitWidth: 360
    implicitHeight: parent && parent.parent ? parent.parent.height : 480
    color: Ui.Theme.surfaceCanvas
    function editorAbove() {
        let item = parent;
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined)
                return item;
            item = item.parent;
        }
        return null;
    }
    function findGestures(item) {
        if (!item)
            return null;
        if (item.gestures !== undefined)
            return item.gestures;
        const children = item.children || [];
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i]);
            if (found)
                return found;
        }
        return null;
    }
    property var editor: null
    property var gestures: null
    function attach() {
        editor = editorAbove();
        gestures = findGestures(editor);
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)
    readonly property var selection: gestures ? gestures.selection : []
    ClipInspectorController {
        id: inspector
        objectName: "colorPanelInspector"
        timeline: root.editor ? root.editor.timeline : null
        clock: root.editor ? root.editor.clock : null
        clipId: root.selection.length === 1 ? root.selection[0] : ""
    }
    ClipEffects.ClipEffectsEdits {
        id: edits
        timelineModel: inspector.timeline
        controller: inspector
    }
    ColorMatchController {
        id: matcher
        objectName: "colorMatchController"
        capture: root.editor ? root.editor.frameCapture : null
        clock: root.editor ? root.editor.clock : null
        clipId: inspector.clipId
    }
    readonly property bool hasPicture: edits.visual
    readonly property var color_: edits.color
    readonly property var wheels: edits.effects.find(effect => effect.type === "liftGammaGain") ?? null
    readonly property var curves: edits.effects.find(effect => effect.type === "curves") ?? null
    readonly property var vignette: edits.effects.find(effect => effect.type === "vignette") ?? null
    readonly property bool basicOn: color_ ? color_.enabled : true
    readonly property bool wheelsOn: wheels ? wheels.enabled : true
    readonly property bool curvesOn: curves ? curves.enabled : true
    readonly property bool vignetteOn: vignette ? vignette.enabled : true
    // Writes to the section's effect, and creates it where the panel's order puts it.
    function writeSection(type, change, phase) {
        const existing = edits.effects.find(effect => effect.type === type);
        if (existing) {
            edits.patch(existing.id, change, phase);
            return;
        }
        const out = edits.effects.slice();
        out.splice(WheelMath.insertionIndex(out, type), 0, Object.assign(WheelMath.identity(type, ClipEffectsUi.newId()), change));
        edits.write(out, phase);
    }
    function removeSection(effect) {
        if (effect)
            edits.remove(effect.id);
    }
    function writeBasic(key, value, phase) {
        const change = {enabled: root.basicOn};
        change[key] = value;
        edits.updateColor(change, phase);
    }
    function fold(key, fallback) {
        return ClipEffectsUi.folds["colorPanel." + key] ?? fallback;
    }
    Column {
        objectName: "colorPanelEmpty"
        anchors.centerIn: parent
        width: parent.width - Ui.Metrics.xxxl
        visible: !root.hasPicture
        spacing: Ui.Metrics.md
        Ui.Text {
            width: parent.width
            text: root.selection.length > 1 ? "Several clips selected" : inspector.clip.id ? "This clip has no picture" : "No clip selected"
            horizontalAlignment: Text.AlignHCenter
            role: Ui.Typography.SansLabel
        }
        Ui.Text {
            width: parent.width
            text: root.selection.length > 1 ? "Select one clip to grade it." : "Select a video or image clip on the timeline to grade it."
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
    Flickable {
        id: viewport
        objectName: "colorPanelViewport"
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.md
        visible: root.hasPicture
        contentWidth: width
        contentHeight: content.height + Ui.Metrics.xl
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {
            id: scrollBar
            objectName: "colorPanelScrollBar"
        }
        Column {
            id: content
            width: viewport.width - scrollBar.width
            InspectorSection {
                id: basicSection
                objectName: "colorBasicSection"
                width: parent.width
                title: "Basic Correction"
                checkable: true
                checked: root.basicOn
                checkboxDisabled: edits.locked
                open: root.fold("basic", true)
                divider: false
                action: ({
                        icon: "refresh",
                        label: "Reset Basic Correction",
                        disabled: !root.color_ || edits.locked,
                        onClick: () => edits.resetColor()
                    })
                onToggled: next => ClipEffectsUi.setFold("colorPanel.basic", next)
                onCheckedChangedByUser: next => edits.updateColor({
                        enabled: next
                    })
                Repeater {
                    // The Premiere order, which reads from the balance down to the tone.
                    model: ["temperature", "tint", "brightness", "contrast", "highlights", "shadows", "saturation", "hue"].map(key => Catalog.colorFields.find(field => field.key === key))
                    delegate: InspectorSliderRow {
                        required property var modelData
                        objectName: "colorBasic_" + modelData.key
                        width: parent.width
                        label: modelData.label
                        min: modelData.min
                        max: modelData.max
                        step: modelData.step
                        origin: modelData.origin
                        value: root.color_?.[modelData.key] ?? modelData.origin
                        display: modelData.key === "hue" ? value.toFixed(0) + "°" : value.toFixed(2)
                        disabled: edits.locked || !root.basicOn
                        onGestureStarted: edits.begin()
                        onPreview: next => root.writeBasic(modelData.key, next, "preview")
                        onChange: next => root.writeBasic(modelData.key, next, "commit")
                        onCanceled: edits.cancel()
                    }
                }
            }
            InspectorSection {
                objectName: "colorWheelsSection"
                width: parent.width
                title: "Wheels"
                checkable: true
                checked: root.wheelsOn
                checkboxDisabled: edits.locked
                open: root.fold("wheels", true)
                action: ({
                        icon: "refresh",
                        label: "Reset Wheels",
                        disabled: !root.wheels || edits.locked,
                        onClick: () => root.removeSection(root.wheels)
                    })
                onToggled: next => ClipEffectsUi.setFold("colorPanel.wheels", next)
                onCheckedChangedByUser: next => root.writeSection("liftGammaGain", {
                        enabled: next
                    }, "apply")
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    Repeater {
                        model: [
                            {
                                kind: "lift",
                                title: "Shadows"
                            },
                            {
                                kind: "gamma",
                                title: "Midtones"
                            },
                            {
                                kind: "gain",
                                title: "Highlights"
                            }
                        ]
                        delegate: ColorWheel {
                            required property var modelData
                            width: (parent.width - 2 * parent.spacing) / 3
                            title: modelData.title
                            kind: modelData.kind
                            values: root.wheels ? root.wheels[modelData.kind] : []
                            disabled: edits.locked || !root.wheelsOn
                            onGestureStarted: edits.begin()
                            onGestureCancelled: edits.cancel()
                            onPatch: (next, phase) => {
                                const change = {};
                                change[modelData.kind] = next;
                                root.writeSection("liftGammaGain", change, phase);
                            }
                        }
                    }
                }
            }
            InspectorSection {
                objectName: "colorMatchSection"
                width: parent.width
                title: "Match"
                open: root.fold("match", true)
                onToggled: next => ClipEffectsUi.setFold("colorPanel.match", next)
                Sections.InspectorCaption {
                    width: parent.width
                    text: "Grade this clip toward a reference. Match sets the wheels and saturation, and you can edit them afterward."
                }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    topPadding: Ui.Metrics.xs
                    bottomPadding: Ui.Metrics.xs
                    Ui.EditorButton {
                        objectName: "colorMatchUseFrame"
                        text: "Use playhead frame"
                        density: Ui.EditorButton.Compact
                        enabled: !matcher.busy
                        onClicked: matcher.useFrameAtPlayhead()
                    }
                    Ui.EditorButton {
                        objectName: "colorMatchUseShot"
                        text: "Use selected clip"
                        density: Ui.EditorButton.Compact
                        enabled: !matcher.busy
                        onClicked: matcher.useSelectedShot()
                    }
                }
                Row {
                    width: parent.width
                    visible: matcher.hasReference
                    spacing: Ui.Metrics.md
                    bottomPadding: Ui.Metrics.xs
                    Rectangle {
                        width: Ui.Metrics.xxxl * 4
                        height: width * 9 / 16
                        color: Ui.Theme.surfaceOverlay
                        FrameImage {
                            objectName: "colorMatchReferenceImage"
                            anchors.fill: parent
                            image: matcher.referenceImage
                        }
                    }
                    Column {
                        width: parent.width - x
                        spacing: Ui.Metrics.xs
                        Ui.Text {
                            objectName: "colorMatchReferenceLabel"
                            width: parent.width
                            text: "Reference"
                            role: Ui.Typography.SansLabel
                        }
                        Ui.Text {
                            width: parent.width
                            text: matcher.referenceClipName || (root.editor ? "Frame at " + TimelineFormat.playheadTimecode(matcher.referenceTimeMs, root.editor.timeline.fps) : "")
                            elide: Text.ElideRight
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                        Ui.EditorButton {
                            objectName: "colorMatchClear"
                            text: "Clear"
                            variant: Ui.EditorButton.Flat
                            density: Ui.EditorButton.Compact
                            enabled: !matcher.busy
                            onClicked: matcher.clearReference()
                        }
                    }
                }
                InspectorToggleRow {
                    objectName: "colorMatchProtectSkin"
                    width: parent.width
                    label: "Protect skin tones"
                    checked: matcher.protectSkin
                    onChange: next => matcher.protectSkin = next
                }
                Row {
                    width: parent.width
                    spacing: Ui.Metrics.md
                    topPadding: Ui.Metrics.xs
                    Ui.EditorButton {
                        objectName: "colorMatchRun"
                        text: "Match"
                        variant: Ui.EditorButton.Primary
                        density: Ui.EditorButton.Compact
                        enabled: matcher.hasReference && !edits.locked && !matcher.busy
                        disabledReason: !matcher.hasReference ? "Choose a reference first." : edits.locked ? "The clip is locked." : ""
                        loading: matcher.busy
                        onClicked: matcher.match()
                    }
                    Ui.EditorButton {
                        objectName: "colorMatchCancel"
                        text: "Cancel"
                        variant: Ui.EditorButton.Flat
                        density: Ui.EditorButton.Compact
                        visible: matcher.busy
                        onClicked: matcher.cancel()
                    }
                }
                Ui.Text {
                    objectName: "colorMatchMessage"
                    width: parent.width
                    visible: text !== ""
                    text: matcher.error || matcher.status
                    wrapMode: Text.WordWrap
                    role: Ui.Typography.SansLabel
                    tone: matcher.error ? Ui.Text.Error : Ui.Text.Secondary
                }
            }
            InspectorSection {
                objectName: "colorCurvesSection"
                width: parent.width
                title: "Curves"
                checkable: true
                checked: root.curvesOn
                checkboxDisabled: edits.locked
                open: root.fold("curves", true)
                action: ({
                        icon: "refresh",
                        label: "Reset Curves",
                        disabled: !root.curves || edits.locked,
                        onClick: () => root.removeSection(root.curves)
                    })
                onToggled: next => ClipEffectsUi.setFold("colorPanel.curves", next)
                onCheckedChangedByUser: next => root.writeSection("curves", {
                        enabled: next
                    }, "apply")
                ClipEffects.ToneCurveEditor {
                    objectName: "colorCurvesEditor"
                    width: parent.width
                    master: root.curves ? root.curves.master || [] : []
                    r: root.curves ? root.curves.r : undefined
                    g: root.curves ? root.curves.g : undefined
                    b: root.curves ? root.curves.b : undefined
                    disabled: edits.locked || !root.curvesOn
                    onGestureStarted: edits.begin()
                    onGestureCancelled: edits.cancel()
                    onPatch: (change, phase) => root.writeSection("curves", change, phase)
                }
            }
            InspectorSection {
                objectName: "colorVignetteSection"
                width: parent.width
                title: "Vignette"
                checkable: true
                checked: root.vignetteOn
                checkboxDisabled: edits.locked
                open: root.fold("vignette", true)
                action: ({
                        icon: "refresh",
                        label: "Reset Vignette",
                        disabled: !root.vignette || edits.locked,
                        onClick: () => root.removeSection(root.vignette)
                    })
                onToggled: next => ClipEffectsUi.setFold("colorPanel.vignette", next)
                onCheckedChangedByUser: next => root.writeSection("vignette", {
                        enabled: next
                    }, "apply")
                Repeater {
                    model: [
                        {
                            key: "amount",
                            label: "Amount",
                            fallback: 0,
                            max: 1
                        },
                        {
                            key: "radius",
                            label: "Midpoint",
                            fallback: 0.9,
                            max: 2
                        },
                        {
                            key: "softness",
                            label: "Feather",
                            fallback: 0.5,
                            max: 1
                        }
                    ]
                    delegate: InspectorSliderRow {
                        required property var modelData
                        objectName: "colorVignette_" + modelData.key
                        width: parent.width
                        label: modelData.label
                        min: 0
                        max: modelData.max
                        step: 0.01
                        origin: modelData.fallback
                        value: root.vignette?.[modelData.key] ?? modelData.fallback
                        display: value.toFixed(2)
                        disabled: edits.locked || !root.vignetteOn
                        onGestureStarted: edits.begin()
                        onPreview: next => {
                            const change = {};
                            change[modelData.key] = next;
                            root.writeSection("vignette", change, "preview");
                        }
                        onChange: next => {
                            const change = {};
                            change[modelData.key] = next;
                            root.writeSection("vignette", change, "commit");
                        }
                        onCanceled: edits.cancel()
                    }
                }
            }
        }
    }
}
