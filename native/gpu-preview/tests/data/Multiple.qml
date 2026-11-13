import QtQuick
import NodeTool.GpuPreview
Rectangle {
    width: 320; height: 240; color: "black"
    property alias preview: left
    property alias source: leftSource
    property alias second: right
    ShaderFrameSource { id: leftSource; catalog: testCatalog; module: "test.quadrants@1"; params: ({ level: 1.0, alpha: 1.0 }) }
    ShaderFrameSource { id: rightSource; catalog: testCatalog; module: "test.quadrants@1"; params: ({ level: 0.5, alpha: 1.0 }) }
    GpuPreviewItem { id: left; x: 0; width: 160; height: 240; source: leftSource; fillMode: GpuPreviewItem.Stretch }
    GpuPreviewItem { id: right; x: 160; width: 160; height: 240; source: rightSource; fillMode: GpuPreviewItem.Stretch }
}
