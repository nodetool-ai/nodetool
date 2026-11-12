if(WIN32)
    get_target_property(qmake_executable Qt6::qmake IMPORTED_LOCATION)
    get_filename_component(qt_binary_directory "${qmake_executable}" DIRECTORY)
    find_program(NODETOOL_WINDEPLOYQT windeployqt HINTS "${qt_binary_directory}" REQUIRED)
    add_custom_command(TARGET nodetool-node-editor POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            $<TARGET_RUNTIME_DLLS:nodetool-node-editor> $<TARGET_FILE_DIR:nodetool-node-editor>
        COMMAND "${NODETOOL_WINDEPLOYQT}" --no-translations --no-compiler-runtime
            --qmldir "${CMAKE_CURRENT_SOURCE_DIR}/qml"
            "$<TARGET_FILE:nodetool-node-editor>"
        COMMAND_EXPAND_LISTS VERBATIM)
endif()
