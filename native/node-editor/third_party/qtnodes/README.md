# QtNodes model interface

These sources come from [paceholder/nodeeditor at commit 829b18457d4e95ac17f4fdb01c6201125681729d](https://github.com/paceholder/nodeeditor/tree/829b18457d4e95ac17f4fdb01c6201125681729d).
The headers are copied from `include/QtNodes/internal/` and the model
implementation from `src/AbstractGraphModel.cpp`. The implementation uses
a local include for `ConnectionIdUtils.hpp`. The geometry header inlines its constructor and coordinate transform and
makes `checkPortHit` abstract. The editor's `NodeGeometry` implements hit
testing using editor metrics.
`Compiler.hpp`, `OperatingSystem.hpp` and `Export.hpp` support the upstream
static export annotations.

The editor compiles the model into `node_editor_core` with
`NODE_EDITOR_STATIC`. See the [upstream BSD-3-Clause license](LICENSE.rst).
