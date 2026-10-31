if(NOT TARGET nodetool_ui_primitives)
    add_subdirectory(../ui_primitives ${CMAKE_CURRENT_BINARY_DIR}/ui_primitives)
endif()
set_source_files_properties(qml/ModelPickerMetrics.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_library(nodetool_model_picker STATIC)
qt_add_qml_module(nodetool_model_picker
    URI NodeTool.ModelPicker
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/ModelPicker
    QML_FILES qml/ModelPicker.qml qml/ModelPickerButton.qml qml/ModelPickerMetrics.qml
    SOURCES src/ModelPickerCatalog.h src/ModelPickerCatalog.cpp)
target_link_libraries(nodetool_model_picker PUBLIC nodetool_ui_primitives)
target_include_directories(nodetool_model_picker PUBLIC src)
target_link_libraries(nodetool_model_picker PUBLIC Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(model-picker-tests tests/tst_modelpicker.cpp)
    target_link_libraries(model-picker-tests PRIVATE nodetool_model_picker Qt6::Test)
    add_test(NAME model-picker-tests COMMAND model-picker-tests)
    qt_add_executable(model-picker-visual-tests tests/tst_modelpicker_visual.cpp)
    target_compile_definitions(model-picker-visual-tests PRIVATE MODEL_PICKER_TEST_QML="${CMAKE_CURRENT_SOURCE_DIR}/tests/PickerVisual.qml")
    target_link_libraries(model-picker-visual-tests PRIVATE nodetool_model_picker nodetool_model_pickerplugin Qt6::Test Qt6::Quick)
    nodetool_use_ui_primitives(model-picker-visual-tests)
    add_test(NAME model-picker-visual-tests COMMAND model-picker-visual-tests)
    set_tests_properties(model-picker-tests model-picker-visual-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
