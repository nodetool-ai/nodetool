# @nodetool-ai/video-nodes

Video and 3D-model nodes for [NodeTool](https://nodetool.ai).

A pack of video-processing and 3D-mesh nodes for NodeTool workflows: trim, concat,
and transform video; apply color and effects; run AI video generation and lip-sync;
edit timelines; and load, repair, and convert 3D models.

## Install

```bash
npm install @nodetool-ai/video-nodes
```

## Nodes

### Video I/O

- `nodetool.video.LoadVideoFile`, `nodetool.video.LoadVideoAssets`
- `nodetool.video.SaveVideo`, `nodetool.video.SaveVideoFile`
- `nodetool.video.GetVideoInfo`

### Editing and transform

- `nodetool.video.Trim`, `nodetool.video.Concat`, `nodetool.video.Reverse`, `nodetool.video.SetSpeed`, `nodetool.video.Fps`
- `nodetool.video.Resize`, `nodetool.video.Rotate`, `nodetool.video.Overlay`, `nodetool.video.Transition`
- `nodetool.video.ExtractFrame`, `nodetool.video.FrameToVideo`, `nodetool.video.ForEachFrame`
- `nodetool.video.AddAudio`, `nodetool.video.ExtractAudio`, `nodetool.video.AddSubtitles`

### Color and effects

- `nodetool.video.Blur`, `nodetool.video.Sharpness`, `nodetool.video.Denoise`, `nodetool.video.Stabilize`
- `nodetool.video.ChromaKey`, `nodetool.video.ColorBalance`, `nodetool.video.Saturation`

### AI generation

- `nodetool.video.TextToVideo`, `nodetool.video.ImageToVideo`, `nodetool.video.VideoToVideo`
- `nodetool.video.LipSync`

### Timeline

Assemble clips and render a multi-track timeline.

- `nodetool.timeline.AddClips`, `nodetool.timeline.RenderTimeline`, `nodetool.timeline.Transcript`

### 3D models

Load, generate, transform, and repair meshes.

- I/O and metadata: `nodetool.model3d.LoadModel3DFile`, `nodetool.model3d.SaveModel3D`, `nodetool.model3d.SaveModel3DFile`, `nodetool.model3d.FormatConverter`, `nodetool.model3d.GetModel3DMetadata`
- Generation: `nodetool.model3d.TextTo3D`, `nodetool.model3d.ImageTo3D`
- Transform: `nodetool.model3d.Transform3D`, `nodetool.model3d.CenterMesh`, `nodetool.model3d.NormalizeModel3D`
- Mesh ops: `nodetool.model3d.Decimate`, `nodetool.model3d.RepairMesh`, `nodetool.model3d.MergeMeshes`, `nodetool.model3d.Boolean3D`, `nodetool.model3d.FlipNormals`, `nodetool.model3d.RecalculateNormals`, `nodetool.model3d.ExtractLargestComponent`

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
