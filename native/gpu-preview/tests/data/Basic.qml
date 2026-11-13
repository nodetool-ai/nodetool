import QtQuick
import NodeTool.GpuPreview
Rectangle {
    width: 320; height: 240; color: "black"
    property alias preview: preview
    property alias source: source
    ShaderFrameSource {
        id: source
        catalog: testCatalog
        module: "test.quadrants@1"
        params: ({ level: 1.0, alpha: 1.0 })
    }
    GpuPreviewItem { id: preview; anchors.fill: parent; source: source; fillMode: GpuPreviewItem.Stretch }
}
