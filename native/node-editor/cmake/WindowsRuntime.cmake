if(WIN32)
    get_target_property(qmake_executable Qt6::qmake IMPORTED_LOCATION)
    get_filename_component(qt_binary_directory "${qmake_executable}" DIRECTORY)
    find_program(NODETOOL_WINDEPLOYQT windeployqt HINTS "${qt_binary_directory}" REQUIRED)
    get_filename_component(compiler_directory "${CMAKE_CXX_COMPILER}" DIRECTORY)
    find_program(NODETOOL_DUMPBIN dumpbin HINTS "${compiler_directory}" REQUIRED)
    set(CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS_SKIP TRUE)
    include(InstallRequiredSystemLibraries)
    # The runner's FFmpeg comes first: Qt's bin holds FFmpeg DLLs of the same
    # names that may lack symbols the runner imports.
    get_target_property(media_runtime_names gr_kernel GR_MEDIA_RUNTIME_NAMES)
    get_target_property(media_runtime_directories gr_kernel GR_MEDIA_RUNTIME_DIRECTORIES)
    set(media_stage_script "${CMAKE_CURRENT_LIST_DIR}/../../graph-runner/cmake/stage-media-runtime-windows.cmake")
    set(runtime_directories ${media_runtime_directories} "${qt_binary_directory}")
    foreach(prefix IN LISTS CMAKE_PREFIX_PATH)
        list(APPEND runtime_directories "${prefix}/bin")
    endforeach()
    list(APPEND runtime_directories "${WASMTIME_ROOT}/lib" "${WASMTIME_ROOT}/bin")
    set(guest_bundle "${NODETOOL_GUEST_BUNDLE}")
    configure_file("${CMAKE_CURRENT_LIST_DIR}/DeployWindowsRuntime.cmake.in"
        "${CMAKE_CURRENT_BINARY_DIR}/DeployWindowsRuntime.cmake" @ONLY)
    # Visual Studio does not support LINK_DEPENDS. Refresh the guest on every
    # editor build, including builds that do not relink the executable.
    add_custom_target(node_editor_windows_guest
        COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_FILE_DIR:nodetool-node-editor>"
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            "${guest_bundle}" "$<TARGET_FILE_DIR:nodetool-node-editor>/guest.js"
        VERBATIM)
    add_dependencies(nodetool-node-editor node_editor_windows_guest)
    add_custom_command(TARGET nodetool-node-editor POST_BUILD
        COMMAND "${CMAKE_COMMAND}" -E copy_if_different
            $<TARGET_RUNTIME_DLLS:nodetool-node-editor> $<TARGET_FILE_DIR:nodetool-node-editor>
        COMMAND "${CMAKE_COMMAND}" "-DEDITOR_BINARY=$<TARGET_FILE:nodetool-node-editor>"
            -P "${CMAKE_CURRENT_BINARY_DIR}/DeployWindowsRuntime.cmake"
        COMMAND_EXPAND_LISTS VERBATIM)
    if(BUILD_TESTING)
        find_program(NODETOOL_DEPLOY_TEST_NODE node REQUIRED)
        string(REPLACE ";" "|" media_runtime_test_directories "${media_runtime_directories}")
        add_test(NAME node_editor_windows_deployment
            COMMAND "${NODETOOL_DEPLOY_TEST_NODE}"
                "${CMAKE_CURRENT_SOURCE_DIR}/scripts/test-windows-runtime.mjs"
                "$<TARGET_FILE:nodetool-node-editor>"
                "${CMAKE_CURRENT_BINARY_DIR}/DeployWindowsRuntime.cmake" "${CMAKE_COMMAND}"
                "${media_runtime_test_directories}")
        set_tests_properties(node_editor_windows_deployment PROPERTIES TIMEOUT 300)
    endif()
endif()
