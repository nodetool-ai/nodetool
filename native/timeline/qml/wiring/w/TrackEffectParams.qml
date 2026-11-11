import QtQuick
import NodeTool.Timeline
Item {
    id: root
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
}
