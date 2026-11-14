# nodetool-parity-host, added by native/node-editor/CMakeLists.txt. It links
# the component interfaces, the NodeTool.NodeEditor and NodeTool.Chat QML
# modules and the UI primitives, and nothing of the editor window, QtNodes or
# the graph runner.
qt_add_executable(nodetool-parity-host main.cpp ParityHost.cpp ParityHost.h Mounts.cpp Mounts.h ComposerSession.cpp ComposerSession.h)
target_link_libraries(nodetool-parity-host PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin
    nodetool_chat nodetool_chatplugin nodetool_model_pickerplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(nodetool-parity-host)
