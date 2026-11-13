cmake_minimum_required(VERSION 3.24)
project(NodeToolNodeEditor LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
include(CTest)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui Widgets QuickWidgets Qml Quick QuickControls2 Svg Network WebSockets Multimedia Test)
qt_standard_project_setup(REQUIRES 6.12)
# Configures only the QML components, their interfaces and the parity
# harness host (native/parity/host), without QtNodes, the graph runner, chat or
# the editor window. A components-only build needs Qt and nothing else.
option(NODETOOL_NODE_EDITOR_COMPONENTS_ONLY "Build only the QML components and the parity host" OFF)
option(NODETOOL_PARITY_HOST "Build the native/parity component host" ON)
add_subdirectory(../ui_primitives ui_primitives)
add_subdirectory(../model-picker model-picker)
add_subdirectory(../media media)
# The C++ interfaces that editor QML components take as required properties,
# with what they need and nothing of the editor window. A component test links
# these, node_editor_qml and the UI primitives only.
add_library(node_editor_interfaces STATIC
 src/interfaces/NodeCatalog.cpp src/interfaces/NodeCatalog.h
 src/interfaces/NodeInspector.cpp src/interfaces/NodeInspector.h
 src/interfaces/NodeInfo.cpp src/interfaces/NodeInfo.h
 src/graph/NodeDocumentation.cpp src/graph/NodeDocumentation.h
 src/interfaces/PropertyHost.cpp src/interfaces/PropertyHost.h
 src/interfaces/GenerationReplay.cpp src/interfaces/GenerationReplay.h
 src/interfaces/GenerationActivity.cpp src/interfaces/GenerationActivity.h
 src/run/GenerationWorkflow.cpp src/run/GenerationWorkflow.h
 src/interfaces/DocumentTabs.cpp src/interfaces/DocumentTabs.h
 src/interfaces/Notifications.cpp src/interfaces/Notifications.h
 src/interfaces/WorkflowHeader.cpp src/interfaces/WorkflowHeader.h
 src/interfaces/PanelLayout.cpp src/interfaces/PanelLayout.h
 src/interfaces/StatusModel.cpp src/interfaces/StatusModel.h
 src/interfaces/EditorCommands.cpp src/interfaces/EditorCommands.h
 src/interfaces/Selection.cpp src/interfaces/Selection.h
 src/interfaces/RunState.cpp src/interfaces/RunState.h
 src/interfaces/Viewport.cpp src/interfaces/Viewport.h
 src/interfaces/FirstWorkflowGuide.cpp src/interfaces/FirstWorkflowGuide.h
 src/interfaces/ChatWindow.cpp src/interfaces/ChatWindow.h
 src/interfaces/Assign.h
 src/graph/CatalogCategories.cpp src/graph/CatalogCategories.h
 src/graph/CatalogSearch.cpp src/graph/CatalogSearch.h
 src/graph/NodeFocus.h
 src/server/PackSetup.cpp src/server/PackSetup.h
 src/server/WorkflowBrowser.cpp src/server/WorkflowBrowser.h
 src/graph/IconPaths.cpp src/graph/IconPaths.h
 src/graph/TypeStyle.cpp src/graph/TypeStyle.h
 src/library/LibraryBrowser.cpp src/library/LibraryBrowser.h)
target_include_directories(node_editor_interfaces PUBLIC src)
# nodetool_media for the asset list model that LibraryBrowser fills.
target_link_libraries(node_editor_interfaces PUBLIC nodetool_media Qt6::Core Qt6::Gui Qt6::Network)
# QML_FOREIGN in the module and qmllint read these types from the metatypes.
qt_extract_metatypes(node_editor_interfaces)
# The editor's QML as the NodeTool.NodeEditor module, compiled by qmlcachegen.
# Files load as qrc:/qt/qml/NodeTool/NodeEditor/<File>.qml: the alias drops the
# qml/ source directory from the resource path.
file(GLOB node_editor_qml_files RELATIVE ${CMAKE_CURRENT_SOURCE_DIR} CONFIGURE_DEPENDS qml/*.qml qml/*.js)
foreach(file IN LISTS node_editor_qml_files)
    get_filename_component(name ${file} NAME)
    set_source_files_properties(${file} PROPERTIES QT_RESOURCE_ALIAS ${name})
endforeach()
qt_add_library(node_editor_qml STATIC)
qt_add_qml_module(node_editor_qml
    URI NodeTool.NodeEditor
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/NodeEditor
    QML_FILES ${node_editor_qml_files}
    SOURCES src/qml/EditorQmlTypes.h src/qml/OutputStyle.cpp src/qml/OutputStyle.h src/qml/TypeIcons.cpp src/qml/TypeIcons.h)
# The generated type registrations include EditorQmlTypes.h by its bare name.
target_include_directories(node_editor_qml PRIVATE src/qml)
target_link_libraries(node_editor_qml PUBLIC node_editor_interfaces nodetool_ui_primitives Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(NODETOOL_PARITY_HOST)
    add_subdirectory(../parity/host parity-host)
endif()
# The table editors through the QML module alone, so they build in the
# components-only configuration too.
if(BUILD_TESTING)
    # PropertyField loads every field type, so the test builds the editor's media
    # QML types and links the model picker, as node_editor_inspector_component_tests does.
    qt_add_executable(node_editor_data_table_tests tests/ui/DataTableEditorTest.cpp
     src/media/MediaResolver.cpp src/media/MediaResolver.h
     src/media/AudioWaveform.cpp src/media/AudioWaveform.h
     src/media/VideoFrameView.cpp src/media/VideoFrameView.h
     src/media/PcmStream.cpp src/media/PcmStream.h src/media/AudioVisualAnalysis.h
     src/media/LiveAudioVisualizer.cpp src/media/LiveAudioVisualizer.h
     src/media/MediaGalleryModel.cpp src/media/MediaGalleryModel.h)
    target_link_libraries(node_editor_data_table_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin nodetool_model_picker nodetool_model_pickerplugin Qt6::Quick Qt6::Multimedia Qt6::Test)
    nodetool_use_ui_primitives(node_editor_data_table_tests)
    add_test(NAME node_editor_data_table COMMAND node_editor_data_table_tests)
    set_tests_properties(node_editor_data_table PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    # The Generations panel and the queue history, with the same media QML types.
    qt_add_executable(node_editor_generations_panel_tests tests/ui/GenerationsPanelTest.cpp
     src/media/MediaResolver.cpp src/media/MediaResolver.h
     src/media/AudioWaveform.cpp src/media/AudioWaveform.h
     src/media/VideoFrameView.cpp src/media/VideoFrameView.h
     src/media/PcmStream.cpp src/media/PcmStream.h src/media/AudioVisualAnalysis.h
     src/media/LiveAudioVisualizer.cpp src/media/LiveAudioVisualizer.h
     src/media/MediaGalleryModel.cpp src/media/MediaGalleryModel.h)
    target_link_libraries(node_editor_generations_panel_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin nodetool_model_picker nodetool_model_pickerplugin Qt6::Quick Qt6::Multimedia Qt6::Test)
    nodetool_use_ui_primitives(node_editor_generations_panel_tests)
    add_test(NAME node_editor_generations_panel COMMAND node_editor_generations_panel_tests)
    set_tests_properties(node_editor_generations_panel PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(NODETOOL_NODE_EDITOR_COMPONENTS_ONLY)
    return()
endif()
include(cmake/QtNodes.cmake)
include(cmake/GraphRunner.cmake)
add_subdirectory(../chat chat)
add_library(node_editor_core STATIC
 src/server/AccountJobs.cpp src/server/AccountJobs.h
 src/server/SetupController.cpp src/server/SetupController.h
 src/layout/AutoLayout.cpp src/layout/AutoLayout.h
 src/layout/SelectionLayout.cpp src/layout/SelectionLayout.h
 src/document/GroupIntoSubgraph.cpp src/document/GroupIntoSubgraph.h
 src/document/WorkflowDocument.cpp src/document/WorkflowDocument.h
 src/document/WorkflowMerge.cpp src/document/WorkflowMerge.h
 src/server/WorkflowVersions.cpp src/server/WorkflowVersions.h
 src/properties/DocumentPickerController.cpp src/properties/DocumentPickerController.h
 src/properties/ResourcePickerController.cpp src/properties/ResourcePickerController.h
 src/properties/AssetPickerController.cpp src/properties/AssetPickerController.h
 src/properties/ModelPickerController.cpp src/properties/ModelPickerController.h
 src/properties/CodeHighlighter.cpp src/properties/CodeHighlighter.h
 src/properties/CodeInference.cpp src/properties/CodeInference.h src/document/ChildPorts.cpp src/document/ChildPorts.h src/document/ChildSources.cpp src/document/ChildSources.h
 src/properties/DynamicPortsController.cpp src/properties/DynamicPortsController.h src/properties/ComfyWorkflowLoader.cpp src/properties/ComfyWorkflowLoader.h src/properties/CompositorLayoutEditor.cpp src/properties/CompositorLayoutEditor.h
 src/server/MsgPack.cpp src/server/WorkflowSession.cpp src/server/WorkflowSession.h
 src/server/BundledServer.cpp src/server/BundledServer.h
 src/graph/WorkflowGraphModel.cpp src/graph/WorkflowGraphModel.h
 src/graph/NodeLayout.cpp src/graph/NodeLayout.h
 src/graph/CardBodies.cpp src/graph/CardBodies.h src/graph/CompositorGeometry.h src/graph/ImageSizePresets.h
 src/graph/CardBodyPainter.cpp src/graph/CardBodyPainter.h
 src/graph/SynthModules.cpp src/graph/SynthModules.h
 src/graph/EditorScene.cpp src/graph/EditorScene.h
 src/graph/LineageLayer.cpp src/graph/LineageLayer.h
 src/graph/InlinePropertyPresenter.cpp src/graph/InlinePropertyPresenter.h
 src/graph/InlineTitlePresenter.cpp src/graph/InlineTitlePresenter.h
 src/graph/CanvasDropController.cpp src/graph/CanvasDropController.h
 src/graph/CanvasMediaPresenter.cpp src/graph/CanvasMediaPresenter.h
 src/graph/CardMedia.cpp src/graph/CardMedia.h src/graph/CardMediaLoader.cpp src/graph/CardMediaLoader.h
 src/graph/CompatibleNodePicker.cpp src/graph/CompatibleNodePicker.h
 src/graph/BodyConnectionRules.cpp src/graph/BodyConnectionRules.h
 src/graph/NodeCreation.cpp src/graph/NodeCreation.h
 src/graph/RerouteTypes.cpp src/graph/RerouteTypes.h
 src/run/RunTraceController.cpp src/run/RunTraceController.h
 src/run/GenerationHistory.cpp src/run/GenerationHistory.h
 src/run/PreviewSourceAssets.cpp src/run/PreviewSourceAssets.h
 src/run/PartialRunPlanner.cpp src/run/PartialRunPlanner.h
 src/run/RunOutputModel.cpp src/run/RunOutputModel.h
 src/run/BugReport.cpp src/run/BugReport.h
 src/run/OutputCollectionModel.cpp src/run/OutputCollectionModel.h
 src/run/NodeRuntimeModel.cpp src/run/NodeRuntimeModel.h
 src/media/MediaResolver.cpp src/media/MediaResolver.h
 src/media/PcmStream.cpp src/media/PcmStream.h
 src/media/AudioVisualAnalysis.h
 src/media/LiveAudioVisualizer.cpp src/media/LiveAudioVisualizer.h
 src/media/AudioWaveform.cpp src/media/AudioWaveform.h
 src/media/MediaGalleryModel.cpp src/media/MediaGalleryModel.h
 src/media/VideoFrameView.cpp src/media/VideoFrameView.h
 src/ui/EditorChat.cpp src/ui/EditorChatTools.cpp src/ui/EditorChatSearch.cpp src/ui/EditorChatSearch.h
 src/ui/EditorWindow.cpp src/ui/EditorTabs.cpp src/ui/ChildSourceLoader.cpp src/ui/CompositorLayoutDialog.cpp src/ui/EditorAppMenu.cpp src/ui/EditorWindow.h src/ui/EditorMenus.cpp src/ui/EditorViewport.cpp src/ui/EditorPanels.cpp)
target_include_directories(node_editor_core PUBLIC src)
target_link_libraries(node_editor_core PRIVATE nodetool_graph_runner)
target_link_libraries(node_editor_core PUBLIC nodetool_model_picker nodetool_model_pickerplugin nodetool_chat nodetool_chatplugin nodetool_media nodetool_mediaplugin QtNodes Qt6::Widgets Qt6::QuickWidgets Qt6::Svg Qt6::Network Qt6::WebSockets Qt6::Multimedia)
qt_add_executable(nodetool-node-editor src/main.cpp)
option(NT_MACOS_BUNDLE "macOS: build nodetool-node-editor as an .app bundle" OFF)
set_target_properties(nodetool-node-editor PROPERTIES MACOSX_BUNDLE ${NT_MACOS_BUNDLE}
    MACOSX_BUNDLE_GUI_IDENTIFIER ai.nodetool.node-editor MACOSX_BUNDLE_BUNDLE_NAME "NodeTool Node Editor")
nodetool_stage_graph_runner_runtime(nodetool-node-editor)
target_link_libraries(nodetool-node-editor PRIVATE node_editor_core)
nodetool_use_ui_primitives(nodetool-node-editor)
include(cmake/WindowsRuntime.cmake)
target_link_libraries(node_editor_core PUBLIC node_editor_interfaces node_editor_qml node_editor_qmlplugin)
qt_add_resources(node_editor_core editor_assets PREFIX /editor/resources BASE resources FILES resources/nodetool_48px.png)
# The workflows the Examples menu opens. Each one runs in process on the local runner.
qt_add_resources(node_editor_core editor_examples PREFIX /editor/examples BASE examples FILES
    examples/live-synth.json
    examples/render-synth.json
    examples/live-clip-phaser.json
    examples/fix-a-flat-image.json
    examples/gate-the-hiss.json
    examples/lo-fi-drum-loop.json
    examples/phaser-and-echo-on-a-pad.json
    examples/plucked-chord-in-a-room.json
    examples/remove-grain-with-a-median-filter.json
    examples/sampler-arpeggio.json
    examples/sampler-drum-kit.json
    examples/sampler-pad.json
    examples/sampler-trigger.json
    examples/three-band-eq.json)
# The web data type icons from web/src/icons/data_types/nodetool, drawn in card headers.
qt_add_resources(node_editor_core editor_type_icons PREFIX /editor/data_types BASE resources/data_types FILES resources/data_types/any.svg resources/data_types/asset.svg resources/data_types/assistant.svg resources/data_types/audio.svg resources/data_types/bool.svg resources/data_types/chunk.svg resources/data_types/database.svg resources/data_types/dataframe.svg resources/data_types/date.svg resources/data_types/datetime.svg resources/data_types/dict.svg resources/data_types/document.svg resources/data_types/enum.svg resources/data_types/file.svg resources/data_types/float.svg resources/data_types/flow.svg resources/data_types/folder.svg resources/data_types/help.svg resources/data_types/image_model.svg resources/data_types/image.svg resources/data_types/int.svg resources/data_types/language_model.svg resources/data_types/list.svg resources/data_types/model_3d.svg resources/data_types/model.svg resources/data_types/notype.svg resources/data_types/np_array.svg resources/data_types/preview.svg resources/data_types/star.svg resources/data_types/string.svg resources/data_types/str.svg resources/data_types/task.svg resources/data_types/tensor.svg resources/data_types/text.svg resources/data_types/thread_message.svg resources/data_types/thread.svg resources/data_types/union.svg resources/data_types/video.svg)
if(BUILD_TESTING)
    qt_add_executable(node_editor_run_trace_tests tests/ui/RunTraceTest.cpp)
    target_link_libraries(node_editor_run_trace_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_run_trace_tests)
    add_test(NAME node_editor_run_trace COMMAND node_editor_run_trace_tests)
    set_tests_properties(node_editor_run_trace PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_large_graph_tests tests/perf/LargeGraphTest.cpp)
    target_link_libraries(node_editor_large_graph_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_large_graph_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json")
    nodetool_use_ui_primitives(node_editor_large_graph_tests)
    add_test(NAME node_editor_large_graph COMMAND node_editor_large_graph_tests)
    # A profile, not a test: run it by hand. See the file header.
    qt_add_executable(node_editor_slider_preview_profile tests/perf/SliderPreviewProfile.cpp)
    target_link_libraries(node_editor_slider_preview_profile PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_slider_preview_profile PRIVATE GUEST_BUNDLE="${NODETOOL_GUEST_BUNDLE}"
        REPO_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../..")
    nodetool_use_ui_primitives(node_editor_slider_preview_profile)
    set_tests_properties(node_editor_large_graph PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_dynamic_card_tests tests/ui/DynamicCardTest.cpp)
    target_link_libraries(node_editor_dynamic_card_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_dynamic_card_tests)
    add_test(NAME node_editor_dynamic_card COMMAND node_editor_dynamic_card_tests)
    set_tests_properties(node_editor_dynamic_card PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_chat_tools_tests tests/ui/EditorChatToolsTest.cpp)
    target_link_libraries(node_editor_chat_tools_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_chat_tools_tests)
    add_test(NAME node_editor_chat_tools COMMAND node_editor_chat_tools_tests)
    set_tests_properties(node_editor_chat_tools PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    include(cmake/CodeInference.cmake)
    qt_add_executable(node_editor_remaining_property_tests tests/ui/RemainingPropertyTest.cpp
        src/document/WorkflowDocument.cpp src/document/WorkflowDocument.h
        src/properties/ResourcePickerController.cpp src/properties/ResourcePickerController.h
        src/properties/AssetPickerController.cpp src/properties/AssetPickerController.h
        src/media/AudioWaveform.cpp src/media/AudioWaveform.h
        src/media/VideoFrameView.cpp src/media/VideoFrameView.h
        src/media/PcmStream.cpp src/media/PcmStream.h src/media/AudioVisualAnalysis.h
        src/media/LiveAudioVisualizer.cpp src/media/LiveAudioVisualizer.h
        src/media/MediaGalleryModel.cpp src/media/MediaGalleryModel.h)
    node_editor_use_code_inference(node_editor_remaining_property_tests)
    target_include_directories(node_editor_remaining_property_tests PRIVATE src)
    target_link_libraries(node_editor_remaining_property_tests PRIVATE Qt6::Network Qt6::Test Qt6::Quick Qt6::Widgets Qt6::Multimedia)
    qt_add_resources(node_editor_remaining_property_tests remaining_property_qml PREFIX /editor BASE qml FILES
        qml/RemainingResourcePropertyEditor.qml qml/PathPropertyEditor.qml qml/FilePropertyEditor.qml
        qml/ToolsPropertyEditor.qml qml/MediaParameterPropertyEditor.qml qml/AssetPropertyEditor.qml
        qml/MediaPreview.qml qml/NodeButton.qml qml/EditorRoles.qml)
    nodetool_use_ui_primitives(node_editor_remaining_property_tests)
    add_test(NAME node_editor_remaining_property COMMAND node_editor_remaining_property_tests)
    set_tests_properties(node_editor_remaining_property PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 # The exit policy for native host jobs of local runs. Every slot runs in a
 # process of its own, because shutting the process lanes down is permanent.
 # The binary links the graph runner's kernel for its test-only lane jobs and
 # compiles src/main.cpp, so its --exit-probe mode runs the shipped main().
 qt_add_executable(node_editor_exit_tests tests/ui/EditorExitTest.cpp)
 target_link_libraries(node_editor_exit_tests PRIVATE node_editor_core gr_kernel Qt6::Test)
 target_compile_definitions(node_editor_exit_tests PRIVATE GUEST_BUNDLE="${NODETOOL_GUEST_BUNDLE}")
 nodetool_use_ui_primitives(node_editor_exit_tests)
 foreach(slot drainsJobThatOutlivesSession timesOutOnJobIgnoringStop editorExitsWithinGraceAndKeepsTabs)
  add_test(NAME node_editor_exit_${slot} COMMAND node_editor_exit_tests ${slot})
  set_tests_properties(node_editor_exit_${slot} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software" TIMEOUT 300)
 endforeach()
 qt_add_executable(node_editor_workflow_tabs_tests tests/ui/WorkflowTabsTest.cpp)
 target_link_libraries(node_editor_workflow_tabs_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_workflow_tabs_tests)
 add_test(NAME node_editor_workflow_tabs COMMAND node_editor_workflow_tabs_tests)
 set_tests_properties(node_editor_workflow_tabs PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_workflow_tabs_drag_tests tests/ui/WorkflowTabsDragTest.cpp)
 target_link_libraries(node_editor_workflow_tabs_drag_tests PRIVATE node_editor_core Qt6::Test Qt6::WebSockets)
 nodetool_use_ui_primitives(node_editor_workflow_tabs_drag_tests)
 add_test(NAME node_editor_workflow_tabs_drag COMMAND node_editor_workflow_tabs_drag_tests)
 set_tests_properties(node_editor_workflow_tabs_drag PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_viewport_navigator_tests tests/ui/ViewportNavigatorTest.cpp)
 target_link_libraries(node_editor_viewport_navigator_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_viewport_navigator_tests)
 add_test(NAME node_editor_viewport_navigator COMMAND node_editor_viewport_navigator_tests)
 set_tests_properties(node_editor_viewport_navigator PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_lineage_host_tests tests/ui/LineageHostTest.cpp)
 target_link_libraries(node_editor_lineage_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_lineage_host_tests)
 add_test(NAME node_editor_lineage_host COMMAND node_editor_lineage_host_tests)
 set_tests_properties(node_editor_lineage_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 add_subdirectory(tests/lineage)
 qt_add_executable(node_editor_inline_property_tests tests/graph/InlinePropertyTest.cpp)
 qt_add_executable(node_editor_canvas_drop_tests tests/ui/CanvasDropTest.cpp)
 target_link_libraries(node_editor_canvas_drop_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_canvas_drop_tests)
 add_test(NAME node_editor_canvas_drop COMMAND node_editor_canvas_drop_tests)
 set_tests_properties(node_editor_canvas_drop PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_inline_title_tests tests/ui/InlineTitleTest.cpp)
 target_link_libraries(node_editor_inline_title_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_inline_title_tests)
 add_test(NAME node_editor_inline_title COMMAND node_editor_inline_title_tests)
 set_tests_properties(node_editor_inline_title PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_inline_host_tests tests/ui/InlineHostTest.cpp)
 target_link_libraries(node_editor_inline_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_inline_host_tests)
 add_test(NAME node_editor_inline_host COMMAND node_editor_inline_host_tests)
 set_tests_properties(node_editor_inline_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 target_link_libraries(node_editor_inline_property_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_inline_property_tests)
 add_test(NAME node_editor_inline_property COMMAND node_editor_inline_property_tests)
 set_tests_properties(node_editor_inline_property PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_server_sync_host_tests tests/ui/ServerSyncHostTest.cpp)
 target_link_libraries(node_editor_server_sync_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_server_sync_host_tests)
 add_test(NAME node_editor_server_sync_host COMMAND node_editor_server_sync_host_tests)
 set_tests_properties(node_editor_server_sync_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_library_panel_tests tests/ui/LibraryPanelTest.cpp)
 target_link_libraries(node_editor_library_panel_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_library_panel_tests)
 add_test(NAME node_editor_library_panel COMMAND node_editor_library_panel_tests)
 set_tests_properties(node_editor_library_panel PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_autosave_host_tests tests/ui/AutosaveHostTest.cpp)
 target_link_libraries(node_editor_autosave_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_autosave_host_tests)
 add_test(NAME node_editor_autosave_host COMMAND node_editor_autosave_host_tests)
 set_tests_properties(node_editor_autosave_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_navigation_tests tests/ui/NavigationTest.cpp)
 target_link_libraries(node_editor_navigation_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_navigation_tests)
 add_test(NAME node_editor_navigation COMMAND node_editor_navigation_tests)
 set_tests_properties(node_editor_navigation PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_group_authoring_tests tests/ui/GroupAuthoringTest.cpp)
 target_link_libraries(node_editor_group_authoring_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_group_authoring_tests)
 add_test(NAME node_editor_group_authoring COMMAND node_editor_group_authoring_tests)
 set_tests_properties(node_editor_group_authoring PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_node_actions_tests tests/ui/NodeActionsTest.cpp)
 target_link_libraries(node_editor_node_actions_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_node_actions_tests)
 add_test(NAME node_editor_node_actions COMMAND node_editor_node_actions_tests)
 set_tests_properties(node_editor_node_actions PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_group_presentation_tests tests/graph/GroupPresentationTest.cpp)
 target_link_libraries(node_editor_group_presentation_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_group_presentation_tests)
 add_test(NAME node_editor_group_presentation COMMAND node_editor_group_presentation_tests)
 set_tests_properties(node_editor_group_presentation PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_incremental_projection_tests tests/graph/IncrementalProjectionTest.cpp)
 target_link_libraries(node_editor_incremental_projection_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_incremental_projection_tests)
 add_test(NAME node_editor_incremental_projection COMMAND node_editor_incremental_projection_tests)
 set_tests_properties(node_editor_incremental_projection PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_card_warning_tests tests/graph/CardWarningTest.cpp)
 target_link_libraries(node_editor_card_warning_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_card_warning_tests)
 add_test(NAME node_editor_card_warning COMMAND node_editor_card_warning_tests)
add_executable(node_editor_node_focus_tests tests/graph/NodeFocusTest.cpp)
target_include_directories(node_editor_node_focus_tests PRIVATE src)
target_link_libraries(node_editor_node_focus_tests PRIVATE Qt6::Core Qt6::Test)
add_test(NAME node_editor_node_focus COMMAND node_editor_node_focus_tests)
 set_tests_properties(node_editor_card_warning PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 add_subdirectory(tests/media)
 add_subdirectory(tests/runtime)
 add_subdirectory(tests/run)
 add_subdirectory(tests/properties)
 add_subdirectory(tests/document)
 add_subdirectory(tests/server)
 add_subdirectory(tests/browser)
 add_subdirectory(tests/layout)
 add_subdirectory(tests/planner)
 add_subdirectory(tests/history)
 qt_add_executable(node_editor_ui_tests tests/ui/EditorTest.cpp)
 target_link_libraries(node_editor_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_ui_tests)
 add_test(NAME node_editor_ui COMMAND node_editor_ui_tests)
 set_tests_properties(node_editor_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 add_test(NAME node_editor_smoke COMMAND nodetool-node-editor --screenshot ${CMAKE_CURRENT_BINARY_DIR}/editor.png --dump ${CMAKE_CURRENT_BINARY_DIR}/empty.json)
 set_tests_properties(node_editor_smoke PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 add_subdirectory(tests/visual)
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_media_ui_tests tests/ui/MediaUiTest.cpp)
 target_link_libraries(node_editor_media_ui_tests PRIVATE node_editor_core Qt6::Test)
 target_compile_definitions(node_editor_media_ui_tests PRIVATE MEDIA_VIDEO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/../timeline/src/preview/effects/fixtures/source-noise.mp4")
 nodetool_use_ui_primitives(node_editor_media_ui_tests)
 add_test(NAME node_editor_media_ui COMMAND node_editor_media_ui_tests)
 set_tests_properties(node_editor_media_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_runtime_ui_tests tests/ui/RuntimeUiTest.cpp)
 target_link_libraries(node_editor_runtime_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_runtime_ui_tests)
 add_test(NAME node_editor_runtime_ui COMMAND node_editor_runtime_ui_tests)
 set_tests_properties(node_editor_runtime_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_run_reconnect_tests tests/ui/RunReconnectTest.cpp)
 target_link_libraries(node_editor_run_reconnect_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_run_reconnect_tests)
 add_test(NAME node_editor_run_reconnect COMMAND node_editor_run_reconnect_tests)
 set_tests_properties(node_editor_run_reconnect PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_structured_ui_tests tests/properties/StructuredPropertyUiTest.cpp)
 target_link_libraries(node_editor_structured_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_structured_ui_tests)
 add_test(NAME node_editor_structured_ui COMMAND node_editor_structured_ui_tests)
 set_tests_properties(node_editor_structured_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_dynamic_ui_tests tests/dynamic-ui/DynamicPortsTest.cpp)
 find_package(Qt6 REQUIRED COMPONENTS QuickTest)
 target_link_libraries(node_editor_dynamic_ui_tests PRIVATE node_editor_core Qt6::Test Qt6::QuickTest)
 target_compile_definitions(node_editor_dynamic_ui_tests PRIVATE DYNAMIC_QML_DIR="${CMAKE_CURRENT_SOURCE_DIR}/qml")
 nodetool_use_ui_primitives(node_editor_dynamic_ui_tests)
 add_test(NAME node_editor_dynamic_ui COMMAND node_editor_dynamic_ui_tests)
 set_tests_properties(node_editor_dynamic_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_authoring_ui_tests tests/ui/AuthoringUiTest.cpp)
 target_link_libraries(node_editor_authoring_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_authoring_ui_tests)
 add_test(NAME node_editor_authoring_ui COMMAND node_editor_authoring_ui_tests)
 set_tests_properties(node_editor_authoring_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_dynamic_ports_tests tests/ui/DynamicPortsTest.cpp)
 target_link_libraries(node_editor_dynamic_ports_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_dynamic_ports_tests)
 add_test(NAME node_editor_dynamic_ports COMMAND node_editor_dynamic_ports_tests)
 set_tests_properties(node_editor_dynamic_ports PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_canvas_authoring_tests tests/ui/CanvasAuthoringTest.cpp)
 target_link_libraries(node_editor_canvas_authoring_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_canvas_authoring_tests)
 add_test(NAME node_editor_canvas_authoring COMMAND node_editor_canvas_authoring_tests)
 set_tests_properties(node_editor_canvas_authoring PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_catalog_tests tests/ui/CatalogTest.cpp)
 target_link_libraries(node_editor_catalog_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_catalog_tests)
 add_test(NAME node_editor_catalog COMMAND node_editor_catalog_tests)
 set_tests_properties(node_editor_catalog PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 # NodeMenu.qml with a fixture catalog: no EditorWindow, graph runner, QtNodes or media.
 qt_add_executable(node_editor_node_menu_component_tests tests/ui/NodeMenuComponentTest.cpp)
 target_link_libraries(node_editor_node_menu_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
 nodetool_use_ui_primitives(node_editor_node_menu_component_tests)
 add_test(NAME node_editor_node_menu_component COMMAND node_editor_node_menu_component_tests)
 set_tests_properties(node_editor_node_menu_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 # TabBar.qml, CanvasTabStrip.qml and NotificationsPanel.qml with fixture
 # interfaces: no EditorWindow, graph runner, QtNodes or media.
 qt_add_executable(node_editor_tab_bar_component_tests tests/ui/TabBarComponentTest.cpp)
 target_link_libraries(node_editor_tab_bar_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
 nodetool_use_ui_primitives(node_editor_tab_bar_component_tests)
 add_test(NAME node_editor_tab_bar_component COMMAND node_editor_tab_bar_component_tests)
 set_tests_properties(node_editor_tab_bar_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 # HeaderRow.qml, Rail.qml and StatusBar.qml with fixture interfaces: no EditorWindow,
 # graph runner, QtNodes or media.
 qt_add_executable(node_editor_header_row_component_tests tests/ui/HeaderRowComponentTest.cpp)
 target_link_libraries(node_editor_header_row_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
 nodetool_use_ui_primitives(node_editor_header_row_component_tests)
 add_test(NAME node_editor_header_row_component COMMAND node_editor_header_row_component_tests)
 set_tests_properties(node_editor_header_row_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# NodeInfoPanel.qml with a fixture NodeInfo, and the documentation split it
# shows: no EditorWindow, graph runner or QtNodes.
qt_add_executable(node_editor_node_info_component_tests tests/ui/NodeInfoComponentTest.cpp)
target_link_libraries(node_editor_node_info_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_node_info_component_tests)
add_test(NAME node_editor_node_info_component COMMAND node_editor_node_info_component_tests)
set_tests_properties(node_editor_node_info_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# Toolbar.qml, SelectionToolbar.qml and AuthoredControls.qml with fixture
# commands, selection and run state: no EditorWindow, graph runner or QtNodes.
qt_add_executable(node_editor_toolbar_component_tests tests/ui/ToolbarComponentTest.cpp)
target_link_libraries(node_editor_toolbar_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_toolbar_component_tests)
add_test(NAME node_editor_toolbar_component COMMAND node_editor_toolbar_component_tests)
set_tests_properties(node_editor_toolbar_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# ViewportIndicator.qml, MiniMapControls.qml and MiniMapPopups.qml with a
# fixture viewport: no EditorWindow, graph runner or QtNodes.
qt_add_executable(node_editor_viewport_component_tests tests/ui/ViewportComponentTest.cpp)
target_link_libraries(node_editor_viewport_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_viewport_component_tests)
add_test(NAME node_editor_viewport_component COMMAND node_editor_viewport_component_tests)
set_tests_properties(node_editor_viewport_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# SetupGuide.qml and OptionalPacksSection.qml with a fixture guide, catalog
# and pack setup: no EditorWindow, graph runner or QtNodes.
qt_add_executable(node_editor_setup_guide_component_tests tests/ui/SetupGuideComponentTest.cpp)
target_link_libraries(node_editor_setup_guide_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_setup_guide_component_tests)
add_test(NAME node_editor_setup_guide_component COMMAND node_editor_setup_guide_component_tests)
set_tests_properties(node_editor_setup_guide_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# WorkflowBrowser.qml with a fixture browser, panel layout and status: no
# EditorWindow, graph runner, QtNodes or server.
qt_add_executable(node_editor_workflow_browser_component_tests tests/ui/WorkflowBrowserComponentTest.cpp)
target_link_libraries(node_editor_workflow_browser_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_workflow_browser_component_tests)
add_test(NAME node_editor_workflow_browser_component COMMAND node_editor_workflow_browser_component_tests)
set_tests_properties(node_editor_workflow_browser_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# The run output's TypeIcons and OutputStyle singletons and its interface
# members: no EditorWindow, graph runner or QtNodes.
qt_add_executable(node_editor_run_output_component_tests tests/ui/RunOutputComponentTest.cpp)
target_link_libraries(node_editor_run_output_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_run_output_component_tests)
add_test(NAME node_editor_run_output_component COMMAND node_editor_run_output_component_tests)
set_tests_properties(node_editor_run_output_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# The ChatWindow interface through the QML module: no EditorWindow, chat
# session, graph runner or QtNodes.
qt_add_executable(node_editor_chat_window_component_tests tests/ui/ChatWindowComponentTest.cpp)
target_link_libraries(node_editor_chat_window_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin Qt6::Quick Qt6::Test)
nodetool_use_ui_primitives(node_editor_chat_window_component_tests)
add_test(NAME node_editor_chat_window_component COMMAND node_editor_chat_window_component_tests)
set_tests_properties(node_editor_chat_window_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 # Inspector.qml with a fixture inspector: no EditorWindow, graph runner or
 # QtNodes. The property fields preview media, so it builds the editor's media
 # QML types and links the model picker, as node_editor_asset_picker_tests does.
 qt_add_executable(node_editor_inspector_component_tests tests/ui/InspectorComponentTest.cpp
  src/media/MediaResolver.cpp src/media/MediaResolver.h
  src/media/AudioWaveform.cpp src/media/AudioWaveform.h
  src/media/VideoFrameView.cpp src/media/VideoFrameView.h
  src/media/PcmStream.cpp src/media/PcmStream.h src/media/AudioVisualAnalysis.h
  src/media/LiveAudioVisualizer.cpp src/media/LiveAudioVisualizer.h
  src/media/MediaGalleryModel.cpp src/media/MediaGalleryModel.h)
 target_link_libraries(node_editor_inspector_component_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin nodetool_model_picker nodetool_model_pickerplugin Qt6::Quick Qt6::Multimedia Qt6::Test)
 nodetool_use_ui_primitives(node_editor_inspector_component_tests)
 add_test(NAME node_editor_inspector_component COMMAND node_editor_inspector_component_tests)
 set_tests_properties(node_editor_inspector_component PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 add_subdirectory(tests/models)
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_generation_history_ui_tests tests/ui/GenerationHistoryUiTest.cpp)
 target_link_libraries(node_editor_generation_history_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_generation_history_ui_tests)
 add_test(NAME node_editor_generation_history_ui COMMAND node_editor_generation_history_ui_tests)
 set_tests_properties(node_editor_generation_history_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_canvas_media_tests tests/graph/CanvasMediaTest.cpp)
 target_link_libraries(node_editor_canvas_media_tests PRIVATE node_editor_core Qt6::Test)
 target_compile_definitions(node_editor_canvas_media_tests PRIVATE MEDIA_VIDEO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/../timeline/src/preview/effects/fixtures/source-noise.mp4")
 nodetool_use_ui_primitives(node_editor_canvas_media_tests)
 add_test(NAME node_editor_canvas_media COMMAND node_editor_canvas_media_tests)
 set_tests_properties(node_editor_canvas_media PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_canvas_media_host_tests tests/ui/CanvasMediaHostTest.cpp)
 target_compile_definitions(node_editor_canvas_media_host_tests PRIVATE GUEST_BUNDLE="${NODETOOL_GUEST_BUNDLE}")
 target_link_libraries(node_editor_canvas_media_host_tests PRIVATE node_editor_core Qt6::Test)
 target_compile_definitions(node_editor_canvas_media_host_tests PRIVATE MEDIA_VIDEO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/../timeline/src/preview/effects/fixtures/source-noise.mp4")
 nodetool_use_ui_primitives(node_editor_canvas_media_host_tests)
 add_test(NAME node_editor_canvas_media_host COMMAND node_editor_canvas_media_host_tests)
 set_tests_properties(node_editor_canvas_media_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_compatible_picker_tests tests/graph/CompatibleNodePickerTest.cpp)
 target_link_libraries(node_editor_compatible_picker_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_compatible_picker_tests)
 add_test(NAME node_editor_compatible_picker COMMAND node_editor_compatible_picker_tests)
 set_tests_properties(node_editor_compatible_picker PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_compatible_picker_host_tests tests/ui/CompatiblePickerHostTest.cpp)
 target_link_libraries(node_editor_compatible_picker_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_compatible_picker_host_tests)
 add_test(NAME node_editor_compatible_picker_host COMMAND node_editor_compatible_picker_host_tests)
 set_tests_properties(node_editor_compatible_picker_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_reroute_presentation_tests tests/graph/ReroutePresentationTest.cpp)
 target_link_libraries(node_editor_reroute_presentation_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_reroute_presentation_tests)
 add_test(NAME node_editor_reroute_presentation COMMAND node_editor_reroute_presentation_tests)
 set_tests_properties(node_editor_reroute_presentation PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_creation_tests tests/graph/NodeCreationTest.cpp)
 target_link_libraries(node_editor_creation_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_creation_tests)
 add_test(NAME node_editor_creation COMMAND node_editor_creation_tests)
 set_tests_properties(node_editor_creation PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_body_connection_tests tests/graph/BodyConnectionTest.cpp)
 target_link_libraries(node_editor_body_connection_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_body_connection_tests)
 add_test(NAME node_editor_body_connection COMMAND node_editor_body_connection_tests)
 set_tests_properties(node_editor_body_connection PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
 qt_add_executable(node_editor_body_drop_host_tests tests/ui/BodyDropHostTest.cpp)
 target_link_libraries(node_editor_body_drop_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_body_drop_host_tests)
 add_test(NAME node_editor_body_drop_host COMMAND node_editor_body_drop_host_tests)
 set_tests_properties(node_editor_body_drop_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
if(BUILD_TESTING)
 qt_add_executable(node_editor_media_gallery_host_tests tests/ui/MediaGalleryHostTest.cpp)
 target_link_libraries(node_editor_media_gallery_host_tests PRIVATE node_editor_core Qt6::Test)
 target_compile_definitions(node_editor_media_gallery_host_tests PRIVATE MEDIA_VIDEO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/../timeline/src/preview/effects/fixtures/source-noise.mp4")
 nodetool_use_ui_primitives(node_editor_media_gallery_host_tests)
 add_test(NAME node_editor_media_gallery_host COMMAND node_editor_media_gallery_host_tests)
 set_tests_properties(node_editor_media_gallery_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_menus_tests tests/ui/MenusTest.cpp)
 target_link_libraries(node_editor_menus_tests PRIVATE node_editor_core Qt6::Test)
 target_compile_definitions(node_editor_menus_tests PRIVATE NODE_EDITOR_PARITY_DOC="${CMAKE_CURRENT_SOURCE_DIR}/docs/parity.md")
 nodetool_use_ui_primitives(node_editor_menus_tests)
 add_test(NAME node_editor_menus COMMAND node_editor_menus_tests)
 set_tests_properties(node_editor_menus PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_output_renderers_tests tests/ui/OutputRenderersTest.cpp)
 target_link_libraries(node_editor_output_renderers_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_output_renderers_tests)
 add_test(NAME node_editor_output_renderers COMMAND node_editor_output_renderers_tests)
 set_tests_properties(node_editor_output_renderers PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_rich_output_host_tests tests/ui/RichOutputHostTest.cpp)
 target_link_libraries(node_editor_rich_output_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_rich_output_host_tests)
 add_test(NAME node_editor_rich_output_host COMMAND node_editor_rich_output_host_tests)
 set_tests_properties(node_editor_rich_output_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_pcm_tests tests/media/PcmStreamTest.cpp)
 target_link_libraries(node_editor_pcm_tests PRIVATE node_editor_core Qt6::Test)
 add_test(NAME node_editor_pcm COMMAND node_editor_pcm_tests)
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_live_audio_visualizer_tests tests/media/LiveAudioVisualizerTest.cpp)
 target_link_libraries(node_editor_live_audio_visualizer_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_live_audio_visualizer_tests)
 add_test(NAME node_editor_live_audio_visualizer COMMAND node_editor_live_audio_visualizer_tests)
 set_tests_properties(node_editor_live_audio_visualizer PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_image_comparison_tests tests/ui/ImageComparisonTest.cpp)
 target_link_libraries(node_editor_image_comparison_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_image_comparison_tests)
 add_test(NAME node_editor_image_comparison COMMAND node_editor_image_comparison_tests)
 set_tests_properties(node_editor_image_comparison PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

qt_add_resources(node_editor_core code_parser PREFIX /editor/code BASE resources/code FILES resources/code/acorn.js resources/code/inference.js resources/code/snippets.json)
qt_add_resources(node_editor_core chat_tool_manifest PREFIX /editor/chat BASE resources/chat FILES resources/chat/tool-manifest.json)
qt_add_resources(node_editor_core synth_modules PREFIX /editor/synth BASE resources/synth FILES resources/synth/modules.json)

if(BUILD_TESTING)
 qt_add_executable(node_editor_versions_tests tests/server/WorkflowVersionsTests.cpp)
 target_link_libraries(node_editor_versions_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_versions_tests)
 add_test(NAME node_editor_versions COMMAND node_editor_versions_tests)
 set_tests_properties(node_editor_versions PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_code_property_tests tests/ui/CodePropertyTest.cpp)
 target_link_libraries(node_editor_code_property_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_code_property_tests)
 add_test(NAME node_editor_code_property COMMAND node_editor_code_property_tests)
 set_tests_properties(node_editor_code_property PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_versions_host_tests tests/ui/WorkflowVersionsHostTest.cpp)
 target_link_libraries(node_editor_versions_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_versions_host_tests)
 add_test(NAME node_editor_versions_host COMMAND node_editor_versions_host_tests)
 set_tests_properties(node_editor_versions_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_version_history_polish_tests tests/ui/VersionHistoryPolishTest.cpp)
 target_link_libraries(node_editor_version_history_polish_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_version_history_polish_tests)
 add_test(NAME node_editor_version_history_polish COMMAND node_editor_version_history_polish_tests)
 set_tests_properties(node_editor_version_history_polish PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_queue_ui_tests tests/ui/QueueUiTest.cpp)
 target_link_libraries(node_editor_queue_ui_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_queue_ui_tests)
 add_test(NAME node_editor_queue_ui COMMAND node_editor_queue_ui_tests)
 set_tests_properties(node_editor_queue_ui PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_setup_host_tests tests/ui/SetupHostTest.cpp)
 target_link_libraries(node_editor_setup_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_setup_host_tests)
 add_test(NAME node_editor_setup_host COMMAND node_editor_setup_host_tests)
 set_tests_properties(node_editor_setup_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
 qt_add_executable(node_editor_subgraph_tests tests/ui/SubgraphTest.cpp)
 target_link_libraries(node_editor_subgraph_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_subgraph_tests)
 add_test(NAME node_editor_subgraph COMMAND node_editor_subgraph_tests)
 set_tests_properties(node_editor_subgraph PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_pack_setup_host_tests tests/ui/PackSetupHostTest.cpp)
    target_link_libraries(node_editor_pack_setup_host_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_pack_setup_host_tests)
    add_test(NAME node_editor_pack_setup_host COMMAND node_editor_pack_setup_host_tests)
    set_tests_properties(node_editor_pack_setup_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_queue_data_tests tests/ui/QueueDataTest.cpp)
    target_link_libraries(node_editor_queue_data_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_queue_data_tests)
    add_test(NAME node_editor_queue_data COMMAND node_editor_queue_data_tests)
    set_tests_properties(node_editor_queue_data PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_instant_update_local_tests tests/ui/InstantUpdateLocalTest.cpp)
    target_link_libraries(node_editor_instant_update_local_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_instant_update_local_tests PRIVATE GUEST_BUNDLE="${NODETOOL_GUEST_BUNDLE}")
    nodetool_use_ui_primitives(node_editor_instant_update_local_tests)
    add_test(NAME node_editor_instant_update_local COMMAND node_editor_instant_update_local_tests)
    set_tests_properties(node_editor_instant_update_local PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_subgraph_card_tests tests/ui/SubgraphCardTest.cpp)
    target_link_libraries(node_editor_subgraph_card_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_subgraph_card_tests)
    add_test(NAME node_editor_subgraph_card COMMAND node_editor_subgraph_card_tests)
    set_tests_properties(node_editor_subgraph_card PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_chat_tests tests/ui/EditorChatTest.cpp)
    target_link_libraries(node_editor_chat_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_chat_tests)
    add_test(NAME node_editor_chat COMMAND node_editor_chat_tests)
    set_tests_properties(node_editor_chat PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_document_property_tests tests/ui/DocumentPropertyTest.cpp)
    target_link_libraries(node_editor_document_property_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_document_property_tests)
    add_test(NAME node_editor_document_property COMMAND node_editor_document_property_tests)
    set_tests_properties(node_editor_document_property PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()


if(BUILD_TESTING)
    qt_add_executable(node_editor_property_behavior_tests tests/ui/PropertyBehaviorTest.cpp)
    target_link_libraries(node_editor_property_behavior_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_property_behavior_tests)
    add_test(NAME node_editor_property_behavior COMMAND node_editor_property_behavior_tests)
    set_tests_properties(node_editor_property_behavior PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_runtime_fake tests/ui/RuntimeInstallFake.cpp)
    target_link_libraries(node_editor_runtime_fake PRIVATE Qt6::Core)
    qt_add_executable(node_editor_runtime_install_tests tests/ui/RuntimeInstallTest.cpp)
    target_link_libraries(node_editor_runtime_install_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_runtime_install_tests)
    add_dependencies(node_editor_runtime_install_tests node_editor_runtime_fake)
    add_test(NAME node_editor_runtime_install COMMAND node_editor_runtime_install_tests)
    set_tests_properties(node_editor_runtime_install PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_window_parity_tests tests/ui/WindowParityTest.cpp)
    target_link_libraries(node_editor_window_parity_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_window_parity_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json")
    nodetool_use_ui_primitives(node_editor_window_parity_tests)
    add_test(NAME node_editor_window_parity COMMAND node_editor_window_parity_tests)
    set_tests_properties(node_editor_window_parity PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_card_bodies_tests tests/ui/CardBodiesTest.cpp)
    target_link_libraries(node_editor_card_bodies_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_card_bodies_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json")
    nodetool_use_ui_primitives(node_editor_card_bodies_tests)
    add_test(NAME node_editor_card_bodies COMMAND node_editor_card_bodies_tests)
    set_tests_properties(node_editor_card_bodies PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_media_cards_tests tests/ui/MediaCardsTest.cpp)
    target_link_libraries(node_editor_media_cards_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_media_cards_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json"
        MEDIA_NODES_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/MediaNodesFixture.json"
        MEDIA_VIDEO_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/../timeline/src/preview/effects/fixtures/source-noise.mp4")
    nodetool_use_ui_primitives(node_editor_media_cards_tests)
    add_test(NAME node_editor_media_cards COMMAND node_editor_media_cards_tests)
    set_tests_properties(node_editor_media_cards PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_header_row_tests tests/ui/HeaderRowTest.cpp)
    target_link_libraries(node_editor_header_row_tests PRIVATE node_editor_core Qt6::Test Qt6::WebSockets)
    target_compile_definitions(node_editor_header_row_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json")
    nodetool_use_ui_primitives(node_editor_header_row_tests)
    add_test(NAME node_editor_header_row COMMAND node_editor_header_row_tests)
    set_tests_properties(node_editor_header_row PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_chrome_parity_tests tests/ui/ChromeParityTest.cpp)
    target_link_libraries(node_editor_chrome_parity_tests PRIVATE node_editor_core Qt6::Test)
    target_compile_definitions(node_editor_chrome_parity_tests PRIVATE
        WINDOW_PARITY_FIXTURE="${CMAKE_CURRENT_SOURCE_DIR}/tests/ui/WindowParityFixture.json")
    nodetool_use_ui_primitives(node_editor_chrome_parity_tests)
    add_test(NAME node_editor_chrome_parity COMMAND node_editor_chrome_parity_tests)
    set_tests_properties(node_editor_chrome_parity PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

if(BUILD_TESTING)
    qt_add_executable(node_editor_selection_presentation_tests tests/ui/SelectionPresentationTest.cpp)
    target_link_libraries(node_editor_selection_presentation_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_selection_presentation_tests)
    add_test(NAME node_editor_selection_presentation COMMAND node_editor_selection_presentation_tests)
    set_tests_properties(node_editor_selection_presentation PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    qt_add_executable(node_editor_canvas_chrome_tests tests/ui/CanvasChromeTest.cpp)
    target_link_libraries(node_editor_canvas_chrome_tests PRIVATE node_editor_core Qt6::Test)
    nodetool_use_ui_primitives(node_editor_canvas_chrome_tests)
    add_test(NAME node_editor_canvas_chrome COMMAND node_editor_canvas_chrome_tests)
    set_tests_properties(node_editor_canvas_chrome PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
    # Each test binary writes its settings to a private temporary directory.
    get_property(node_editor_test_targets DIRECTORY PROPERTY BUILDSYSTEM_TARGETS)
    foreach(test_target IN LISTS node_editor_test_targets)
        if(test_target MATCHES "_tests$")
            target_sources(${test_target} PRIVATE tests/support/SettingsIsolation.cpp)
            if(APPLE)
                target_sources(${test_target} PRIVATE tests/support/MainQueuePump.cpp)
                target_link_libraries(${test_target} PRIVATE "-framework CoreFoundation")
            endif()
        endif()
    endforeach()
endif()

nodetool_stage_editor_executables()
