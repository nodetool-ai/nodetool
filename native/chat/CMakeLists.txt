cmake_minimum_required(VERSION 3.22)
project(NodeToolChat VERSION 0.1.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
include(CTest)
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Gui Qml Quick QuickControls2 Svg Network WebSockets Test QuickTest)
qt_standard_project_setup(REQUIRES 6.12)
if(NOT TARGET nodetool_model_picker)
    add_subdirectory(../model-picker ${CMAKE_CURRENT_BINARY_DIR}/model-picker)
endif()

file(GLOB chat_qml_files CONFIGURE_DEPENDS qml/*.qml)
foreach(chat_qml IN LISTS chat_qml_files)
    get_filename_component(chat_qml_name "${chat_qml}" NAME)
    set_source_files_properties("${chat_qml}" PROPERTIES QT_RESOURCE_ALIAS "${chat_qml_name}")
endforeach()
set_source_files_properties(qml/ChatMetrics.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)
qt_add_library(nodetool_chat STATIC)
qt_add_qml_module(nodetool_chat
    URI NodeTool.Chat
    RESOURCE_PREFIX /qt/qml
    QML_FILES
        qml/ChatMetrics.qml qml/ChatPanel.qml qml/Main.qml qml/ThreadList.qml
        qml/ConversationView.qml qml/MessageDelegate.qml qml/ChatComposer.qml
    SOURCES
        src/model/ThreadModel.h src/model/ThreadModel.cpp
        src/model/MessageModel.h src/model/MessageModel.cpp
        src/runtime/ChatSession.h src/runtime/ChatSession.cpp
        src/server/ChatClient.h src/server/ChatClient.cpp)
target_include_directories(nodetool_chat PUBLIC src)
target_link_libraries(nodetool_chat PUBLIC nodetool_ui_primitives nodetool_model_picker Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Network Qt6::WebSockets)
if(MSVC)
    target_compile_options(nodetool_chat PRIVATE /W4)
else()
    target_compile_options(nodetool_chat PRIVATE -Wall -Wextra)
endif()
qt_add_executable(nodetool-chat src/main.cpp src/appearance/AppearanceSettings.h src/appearance/AppearanceSettings.cpp)
nodetool_use_ui_primitives(nodetool-chat)
target_link_libraries(nodetool-chat PRIVATE nodetool_chat nodetool_chatplugin nodetool_model_pickerplugin)
set_target_properties(nodetool-chat PROPERTIES MACOSX_BUNDLE TRUE WIN32_EXECUTABLE TRUE
    MACOSX_BUNDLE_GUI_IDENTIFIER ai.nodetool.chat)
install(TARGETS nodetool-chat BUNDLE DESTINATION . RUNTIME DESTINATION bin)
install(FILES ../ui_primitives/resources/licenses/LICENSE-Inter.txt ../ui_primitives/resources/licenses/LICENSE-JetBrainsMono.txt
    ../ui_primitives/resources/licenses/LICENSE-MUI.txt ../ui_primitives/resources/licenses/LICENSE-Material-Icons.txt
    ../ui_primitives/resources/licenses/MATERIAL-ICONS.md ../ui_primitives/resources/icons/providers/README.md
    DESTINATION share/licenses/nodetool-chat)
if(APPLE)
    get_target_property(chat_qtpaths Qt6::qtpaths IMPORTED_LOCATION)
    execute_process(COMMAND "${chat_qtpaths}" --query QT_INSTALL_QML
        OUTPUT_VARIABLE CHAT_QT_QML_DIR OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
    configure_file(cmake/DereferenceQtLinks.cmake.in "${CMAKE_CURRENT_BINARY_DIR}/DereferenceQtLinks.cmake" @ONLY)
    qt_generate_deploy_script(TARGET nodetool-chat OUTPUT_SCRIPT chat_deploy_script CONTENT
        "qt_deploy_qml_imports(TARGET nodetool-chat PLUGINS_FOUND plugins_found)
include(\"${CMAKE_CURRENT_BINARY_DIR}/DereferenceQtLinks.cmake\")
qt_deploy_runtime_dependencies(EXECUTABLE \"nodetool-chat.app\" ADDITIONAL_MODULES \${plugins_found})")
else()
    qt_generate_deploy_qml_app_script(TARGET nodetool-chat OUTPUT_SCRIPT chat_deploy_script NO_UNSUPPORTED_PLATFORM_ERROR)
endif()
install(SCRIPT ${chat_deploy_script})

if(BUILD_TESTING)
    add_subdirectory(tests)
endif()
