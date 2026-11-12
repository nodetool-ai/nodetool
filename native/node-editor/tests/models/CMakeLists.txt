if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
 cmake_minimum_required(VERSION 3.24)
 project(NodeEditorModelTests LANGUAGES CXX)
 enable_testing()
 find_package(Qt6 6.12 REQUIRED COMPONENTS Core Network Test Quick QuickControls2 Qml Widgets Svg WebSockets)
include(${CMAKE_CURRENT_LIST_DIR}/../../cmake/CodeInference.cmake)
 qt_standard_project_setup(REQUIRES 6.12)
 add_subdirectory(../../../ui_primitives ui_primitives)
 add_subdirectory(../../../model-picker model-picker)
endif()
qt_add_executable(node_editor_model_tests ../../src/graph/NodeCreation.cpp ModelPickerTest.cpp ../../src/document/WorkflowDocument.cpp ../../src/document/WorkflowDocument.h ../../src/properties/ModelPickerController.cpp ../../src/properties/ModelPickerController.h)
node_editor_use_code_inference(node_editor_model_tests)
target_include_directories(node_editor_model_tests PRIVATE ../../src)
target_link_libraries(node_editor_model_tests PRIVATE nodetool_model_picker nodetool_model_pickerplugin Qt6::Network Qt6::Test Qt6::Quick Qt6::Widgets Qt6::WebSockets)
qt_add_resources(node_editor_model_tests model_qml PREFIX /editor BASE ../../qml FILES ../../qml/ModelPropertyEditor.qml ../../qml/NodeButton.qml ../../qml/EditorRoles.qml)
nodetool_use_ui_primitives(node_editor_model_tests)
add_test(NAME node_editor_models COMMAND node_editor_model_tests)
set_tests_properties(node_editor_models PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
# PropertyField takes a PropertyHost, so this test loads the editor's QML module.
if(TARGET node_editor_qml)
 find_package(Qt6 REQUIRED COMPONENTS Multimedia)
 qt_add_executable(node_editor_asset_picker_tests AssetPickerTest.cpp
  ../../src/properties/ResourcePickerController.cpp ../../src/properties/ResourcePickerController.h
  ../../src/properties/AssetPickerController.cpp ../../src/properties/AssetPickerController.h
  ../../src/document/WorkflowDocument.cpp ../../src/document/WorkflowDocument.h
  ../../src/media/MediaResolver.cpp ../../src/media/MediaResolver.h
  ../../src/media/AudioWaveform.cpp ../../src/media/AudioWaveform.h
  ../../src/media/VideoFrameView.cpp ../../src/media/VideoFrameView.h
  ../../src/media/PcmStream.cpp ../../src/media/PcmStream.h ../../src/media/AudioVisualAnalysis.h
  ../../src/media/LiveAudioVisualizer.cpp ../../src/media/LiveAudioVisualizer.h
  ../../src/media/MediaGalleryModel.cpp ../../src/media/MediaGalleryModel.h)
 node_editor_use_code_inference(node_editor_asset_picker_tests)
 target_include_directories(node_editor_asset_picker_tests PRIVATE ../../src)
 target_link_libraries(node_editor_asset_picker_tests PRIVATE node_editor_interfaces node_editor_qml node_editor_qmlplugin nodetool_model_picker nodetool_model_pickerplugin Qt6::Network Qt6::Test Qt6::Quick Qt6::Widgets Qt6::Multimedia)
 nodetool_use_ui_primitives(node_editor_asset_picker_tests)
 add_test(NAME node_editor_asset_picker COMMAND node_editor_asset_picker_tests)
 set_tests_properties(node_editor_asset_picker PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()

qt_add_executable(node_editor_resource_picker_tests ResourcePickerTest.cpp
 ../../src/properties/ResourcePickerController.cpp ../../src/properties/ResourcePickerController.h
 ../../src/document/WorkflowDocument.cpp ../../src/document/WorkflowDocument.h)
node_editor_use_code_inference(node_editor_resource_picker_tests)
target_include_directories(node_editor_resource_picker_tests PRIVATE ../../src)
target_link_libraries(node_editor_resource_picker_tests PRIVATE Qt6::Network Qt6::Test Qt6::Quick Qt6::Widgets)
qt_add_resources(node_editor_resource_picker_tests resource_picker_qml PREFIX /editor BASE ../../qml FILES
 ../../qml/WorkflowPropertyEditor.qml ../../qml/CollectionPropertyEditor.qml ../../qml/NodeButton.qml ../../qml/EditorRoles.qml)
nodetool_use_ui_primitives(node_editor_resource_picker_tests)
add_test(NAME node_editor_resource_picker COMMAND node_editor_resource_picker_tests)
set_tests_properties(node_editor_resource_picker PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
if(TARGET node_editor_core)
 qt_add_executable(node_editor_property_picker_host_tests PropertyPickerHostTest.cpp)
 target_link_libraries(node_editor_property_picker_host_tests PRIVATE node_editor_core Qt6::Test)
 nodetool_use_ui_primitives(node_editor_property_picker_host_tests)
 add_test(NAME node_editor_property_picker_host COMMAND node_editor_property_picker_host_tests)
 set_tests_properties(node_editor_property_picker_host PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
qt_add_executable(node_editor_presentation_property_tests PresentationPropertyTest.cpp
 ../../src/document/WorkflowDocument.cpp ../../src/document/WorkflowDocument.h)
node_editor_use_code_inference(node_editor_presentation_property_tests)
target_include_directories(node_editor_presentation_property_tests PRIVATE ../../src)
target_link_libraries(node_editor_presentation_property_tests PRIVATE Qt6::Network Qt6::Test Qt6::Quick Qt6::Widgets)
target_compile_definitions(node_editor_presentation_property_tests PRIVATE PROPERTY_WEB_ROOT="${CMAKE_CURRENT_SOURCE_DIR}/../../../../web/src")
qt_add_resources(node_editor_presentation_property_tests presentation_qml PREFIX /editor BASE ../../qml FILES
 ../../qml/ColorPropertyEditor.qml ../../qml/ImageSizePropertyEditor.qml ../../qml/PropertyPresets.js ../../qml/NodeButton.qml ../../qml/EditorRoles.qml)
nodetool_use_ui_primitives(node_editor_presentation_property_tests)
add_test(NAME node_editor_presentation_properties COMMAND node_editor_presentation_property_tests)
set_tests_properties(node_editor_presentation_properties PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
nodetool_stage_editor_executables()
