set_source_files_properties(qml/ModelPickerTheme.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_library(nodetool_model_picker STATIC)
qt_add_qml_module(nodetool_model_picker
    URI NodeTool.ModelPicker
    RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/ModelPicker
    QML_FILES qml/ModelPicker.qml qml/ModelPickerButton.qml qml/ModelPickerTheme.qml qml/ModelPickerNavIcon.qml
    SOURCES src/ModelPickerCatalog.h src/ModelPickerCatalog.cpp)
set(MODEL_PICKER_PROVIDER_ICON_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../web/src/icons/providers")
file(GLOB MODEL_PICKER_PROVIDER_ICONS CONFIGURE_DEPENDS "${MODEL_PICKER_PROVIDER_ICON_DIR}/*.svg")
set(MODEL_PICKER_RENDER_ICON_DIR "${CMAKE_CURRENT_BINARY_DIR}/provider-icons")
file(MAKE_DIRECTORY "${MODEL_PICKER_RENDER_ICON_DIR}")
set(MODEL_PICKER_RENDER_ICONS)
foreach(icon IN LISTS MODEL_PICKER_PROVIDER_ICONS)
    get_filename_component(icon_name "${icon}" NAME)
    file(READ "${icon}" icon_svg)
    string(REPLACE "currentColor" "#C5C8CE" icon_svg "${icon_svg}")
    string(REGEX MATCH "<svg[^>]*>" icon_root "${icon_svg}")
    if(NOT icon_root MATCHES "fill=")
        string(REPLACE "<svg" "<svg fill=\"#C5C8CE\"" icon_svg "${icon_svg}")
    endif()
    set(render_icon "${MODEL_PICKER_RENDER_ICON_DIR}/${icon_name}")
    if(EXISTS "${render_icon}")
        file(READ "${render_icon}" current_icon_svg)
    endif()
    if(NOT EXISTS "${render_icon}" OR NOT current_icon_svg STREQUAL icon_svg)
        file(WRITE "${render_icon}" "${icon_svg}")
    endif()
    list(APPEND MODEL_PICKER_RENDER_ICONS "${render_icon}")
endforeach()
configure_file("${MODEL_PICKER_PROVIDER_ICON_DIR}/README.md" "${MODEL_PICKER_RENDER_ICON_DIR}/README.md" COPYONLY)
qt_add_resources(nodetool_model_picker model_picker_provider_icons
    PREFIX /model-picker/providers
    BASE "${MODEL_PICKER_RENDER_ICON_DIR}"
    FILES ${MODEL_PICKER_RENDER_ICONS} "${MODEL_PICKER_RENDER_ICON_DIR}/README.md")
target_include_directories(nodetool_model_picker PUBLIC src)
target_link_libraries(nodetool_model_picker PUBLIC Qt6::Core Qt6::Qml Qt6::Quick Qt6::QuickControls2)
if(BUILD_TESTING)
    qt_add_executable(model-picker-tests tests/tst_modelpicker.cpp)
    target_link_libraries(model-picker-tests PRIVATE nodetool_model_picker Qt6::Test)
    add_test(NAME model-picker-tests COMMAND model-picker-tests)
    qt_add_executable(model-picker-visual-tests tests/tst_modelpicker_visual.cpp)
    target_compile_definitions(model-picker-visual-tests PRIVATE MODEL_PICKER_TEST_QML="${CMAKE_CURRENT_SOURCE_DIR}/tests/PickerVisual.qml")
    target_link_libraries(model-picker-visual-tests PRIVATE nodetool_model_picker nodetool_model_pickerplugin Qt6::Test Qt6::Quick)
    add_test(NAME model-picker-visual-tests COMMAND model-picker-visual-tests)
    set_tests_properties(model-picker-tests model-picker-visual-tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
