import QtQuick
import NodeTool.Timeline
import "../../vst"
Item {
    id: root
    property string trackId: ""
    required property var effect
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    signal editCanceled()
    implicitHeight: loader.item ? loader.item.implicitHeight : 0
    Loader {
        id: loader
        width: parent.width
        sourceComponent: {
            switch (root.effect.type) {
            case "gain": return editor0
            case "eq3": return editor1
            case "filter": return editor2
            case "compressor": return editor3
            case "colorCorrection": return editor4
            case "videoBlur": return editor5
            case "sharpen": return editor6
            case "vignette": return editor7
            case "chromaKey": return editor8
            case "fable": return editorFable
            case "vst": return editorVst
            default: return null
            }
        }
    }
    Component {
        id: editor0
        GainEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor1
        Eq3Editor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor2
        FilterEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor3
        CompressorEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor4
        ColorCorrectionEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor5
        VideoBlurEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor6
        SharpenEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor7
        VignetteEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editor8
        ChromaKeyEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editorFable
        FableEffectEditor {
            effect: root.effect
            disabled: root.disabled
            onPreview: patch => root.preview(patch)
            onCommit: patch => root.commit(patch)
            onEditCanceled: root.editCanceled()
        }
    }
    Component {
        id: editorVst
        VstPluginControl {
            instrumentMode: false
            instanceId: root.trackId !== "" && root.effect && root.effect.id ? ("fx:" + root.trackId + ":" + root.effect.id) : ""
            editorTitle: root.effect && root.effect.plugin && root.effect.plugin.name ? root.effect.plugin.name : "VST3 Effect"
            plugin: root.effect ? (root.effect.plugin || null) : null
            pluginState: root.effect ? (root.effect.state || null) : null
            wet: root.effect && root.effect.wet !== undefined ? root.effect.wet : 1.0
            disabled: root.disabled
            onPluginChosen: pluginRef => root.commit({ plugin: pluginRef, state: null })
            onWetChangedRequested: value => root.commit({ wet: value })
        }
    }
}
