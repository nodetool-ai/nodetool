cmake_minimum_required(VERSION 3.22)
project(NodeToolUiPrimitives LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
include(CTest)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui Qml Quick QuickControls2 Svg)
qt_standard_project_setup(REQUIRES 6.12)
foreach(name Theme Typography Metrics Icons Text Icon EditorButton ToolbarIconButton Fader LevelMeter TextField TextArea NumberField ProviderIcon Select Dialog Surface Separator PanelHeader Popover ContextMenu MenuItem ListRow Tooltip ShortcutHint Slider Toggle ScrollBar Progress BusyIndicator InspectorRow InspectorCard InspectorSection CheckBox)
    set_source_files_properties(qml/${name}.qml PROPERTIES QT_RESOURCE_ALIAS ${name}.qml)
endforeach()
foreach(name Theme Typography Metrics Icons)
    set_source_files_properties(qml/${name}.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
endforeach()
qt_add_library(nodetool_ui_primitives STATIC)
qt_add_qml_module(nodetool_ui_primitives URI NodeTool.UiPrimitives
    CLASS_NAME NodeToolUiPrimitivesPlugin RESOURCE_PREFIX /qt/qml
    OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/NodeTool/UiPrimitives
    QML_FILES qml/Theme.qml qml/Typography.qml qml/Metrics.qml qml/Icons.qml qml/Text.qml qml/Icon.qml qml/EditorButton.qml qml/ToolbarIconButton.qml qml/MenuButton.qml qml/Fader.qml qml/LevelMeter.qml qml/TextField.qml qml/TextArea.qml qml/NumberField.qml qml/ProviderIcon.qml qml/Select.qml qml/Dialog.qml qml/Surface.qml qml/Separator.qml qml/PanelHeader.qml qml/Popover.qml qml/ContextMenu.qml qml/MenuItem.qml qml/ListRow.qml qml/Tooltip.qml qml/ShortcutHint.qml qml/Slider.qml qml/Toggle.qml qml/ScrollBar.qml qml/Progress.qml qml/BusyIndicator.qml qml/Status.qml qml/Banner.qml qml/EmptyState.qml qml/InspectorRow.qml qml/InspectorCard.qml qml/InspectorSection.qml qml/CheckBox.qml
    SOURCES private/PressCancel.h private/PressCancel.cpp)
target_link_libraries(nodetool_ui_primitives PUBLIC Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Svg)
target_include_directories(nodetool_ui_primitives PRIVATE private)
qt_add_resources(nodetool_ui_primitives ui_fonts PREFIX /qt/qml/NodeTool/UiPrimitives/fonts
    BASE resources/fonts FILES
    resources/fonts/inter-latin-400-normal.ttf resources/fonts/inter-latin-500-normal.ttf
    resources/fonts/inter-latin-600-normal.ttf resources/fonts/jetbrains-mono-latin-400-normal.ttf
    resources/fonts/jetbrains-mono-latin-500-normal.ttf resources/fonts/jetbrains-mono-latin-600-normal.ttf)
file(GLOB ui_provider_icons CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/resources/icons/providers/*.svg")
qt_add_resources(nodetool_ui_primitives ui_provider_icons
    PREFIX /qt/qml/NodeTool/UiPrimitives/providers
    BASE resources/icons/providers FILES ${ui_provider_icons})
file(GLOB ui_provider_light_icons CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/resources/icons/providers-light/*.svg")
qt_add_resources(nodetool_ui_primitives ui_provider_light_icons
    PREFIX /qt/qml/NodeTool/UiPrimitives/providers-light
    BASE resources/icons/providers-light FILES ${ui_provider_light_icons})
function(nodetool_use_ui_primitives target)
    get_target_property(already_added ${target} NODETOOL_UI_PLUGIN_IMPORTED)
    if(already_added)
        return()
    endif()
    set(import_file "${CMAKE_CURRENT_BINARY_DIR}/${target}_ui_plugin_import.cpp")
    file(WRITE "${import_file}" "#include <QtQml/qqmlextensionplugin.h>\nQ_IMPORT_QML_PLUGIN(NodeToolUiPrimitivesPlugin)\n")
    target_sources(${target} PRIVATE "${import_file}")
    target_link_libraries(${target} PRIVATE nodetool_ui_primitives nodetool_ui_primitivesplugin)
    set_property(TARGET ${target} PROPERTY NODETOOL_UI_PLUGIN_IMPORTED TRUE)
endfunction()
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    qt_add_executable(ui_gallery gallery/main.cpp)
    qt_add_resources(ui_gallery gallery_qml PREFIX / FILES gallery/Main.qml)
    nodetool_use_ui_primitives(ui_gallery)
endif()
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR AND BUILD_TESTING)
    find_package(Qt6 6.12 REQUIRED COMPONENTS Test QuickTest)
    add_test(NAME ui_gallery_smoke COMMAND ui_gallery --screenshot ${CMAKE_CURRENT_BINARY_DIR}/gallery.png)
    qt_add_executable(ui_primitives_tests tests/main.cpp)
    target_link_libraries(ui_primitives_tests PRIVATE Qt6::QuickTest Qt6::Test)
    nodetool_use_ui_primitives(ui_primitives_tests)
    add_test(NAME ui_primitives_tests COMMAND ui_primitives_tests -input ${CMAKE_CURRENT_SOURCE_DIR}/tests/qml)
    qt_add_executable(ui_accessibility_tests tests/accessibility.cpp)
    target_link_libraries(ui_accessibility_tests PRIVATE Qt6::Test)
    nodetool_use_ui_primitives(ui_accessibility_tests)
    add_test(NAME ui_accessibility_tests COMMAND ui_accessibility_tests)
    # Keep Windows test tools attached to standard output for CTest.
    set_target_properties(ui_gallery ui_primitives_tests ui_accessibility_tests PROPERTIES WIN32_EXECUTABLE FALSE)
    set_tests_properties(ui_gallery_smoke ui_primitives_tests ui_accessibility_tests PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endif()
