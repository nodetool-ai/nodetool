pragma ComponentBehavior: Bound

import QtQuick
import NodeTool.GpuPreview

// The demo: a WGSL compute shader runs on the wgpu engine, its output
// texture is the content of GpuPreviewItem, and ordinary QML items move
// over it. `demoCatalog`, `demoModule`, `demoFormat`, `demoPacing` and
// `demoFrameSize` are set by main.cpp.
Window {
    id: root

    required property string demoCatalog
    required property string demoModule
    required property int demoFormat
    required property int demoPacing
    required property size demoFrameSize
    property alias preview: preview
    property alias source: source

    width: 960
    height: 540
    visible: true
    color: "#101418"
    title: "NodeTool GPU preview: " + source.device

    ShaderFrameSource {
        id: source

        catalog: root.demoCatalog
        module: root.demoModule
        format: root.demoFormat
        pacing: root.demoPacing
        frameSize: root.demoFrameSize
    }

    GpuPreviewItem {
        id: preview

        anchors.fill: parent
        anchors.margins: 24
        source: source
        fillMode: GpuPreviewItem.Stretch
    }

    // QML content above the GPU image.
    Rectangle {
        id: marker

        width: 120
        height: 72
        radius: 8
        color: "#cc1e88e5"
        border.color: "white"
        border.width: 2
        y: root.height / 2 - height / 2

        SequentialAnimation on x {
            loops: Animation.Infinite

            NumberAnimation {
                from: 0
                to: root.width - marker.width
                duration: 2600
                easing.type: Easing.InOutSine
            }

            NumberAnimation {
                from: root.width - marker.width
                to: 0
                duration: 2600
                easing.type: Easing.InOutSine
            }
        }

        Text {
            anchors.centerIn: parent
            color: "white"
            font.pixelSize: 16
            text: "QML overlay"
        }
    }

    Text {
        id: status

        anchors.left: parent.left
        anchors.bottom: parent.bottom
        anchors.margins: 8
        color: "white"
        font.pixelSize: 13
        style: Text.Outline
        styleColor: "black"

        Timer {
            interval: 500
            running: true
            repeat: true
            onTriggered: {
                const s = source.stats();
                status.text = preview.status === GpuPreviewItem.Ready
                    ? preview.frameSize.width + "x" + preview.frameSize.height + "  shown " + s.framesPresented
                      + "  dropped " + s.framesDropped + "  CPU transfers " + s.gpuToCpuTransfers + "  GPU copies "
                      + s.gpuToGpuCopies + "  latency " + s.latencyMsAverage.toFixed(1) + " ms"
                    : (preview.statusText || source.error || "waiting for the first frame");
            }
        }
    }
}
