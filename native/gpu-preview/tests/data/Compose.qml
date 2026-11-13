import QtQuick
import NodeTool.GpuPreview
Rectangle {
    width: 320; height: 240; color: "#000080"
    property alias preview: preview
    property alias source: source
    ShaderFrameSource {
        id: source
        catalog: testCatalog
        module: "test.quadrants@1"
        params: ({ level: 1.0, alpha: 0.5 })
    }
    Item {
        x: 0; y: 0; width: 160; height: 240; clip: true
        GpuPreviewItem { id: preview; width: 320; height: 240; source: source; fillMode: GpuPreviewItem.Stretch }
    }
    Rectangle { x: 20; y: 20; width: 40; height: 40; color: "#ffff00" }
}
