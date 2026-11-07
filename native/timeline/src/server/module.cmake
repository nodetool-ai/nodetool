nt_qml_files(qml/DocumentBar.qml)
nt_qml_files(qml/UnsupportedColorVersion.qml)
nt_qml_files(qml/SaveStatus.qml)
nt_qml_files(qml/SaveBanners.qml)
nt_sources(app
    src/server/SaveCli.h
    src/server/SaveCli.cpp
)
nt_sources(server
    src/server/ServerClient.h
    src/server/ServerClient.cpp
    src/server/AssetCache.h
    src/server/AssetCache.cpp
    src/server/FieldAudit.h
    src/server/FieldAudit.cpp
    src/server/ServerTimeline.h
    src/server/ServerTimeline.cpp
    src/server/ServerSource.h
    src/server/ServerSource.cpp
    src/server/AutosaveController.h
    src/server/AutosaveController.cpp
)

function(nt_server_tests)
    nt_qt_test(tst_colorspaceversion LIBS timeline_server Qt6::Test)
    target_compile_definitions(tst_colorspaceversion PRIVATE
        NT_TIMELINE_BINARY="$<TARGET_FILE:nodetool-timeline>"
        NT_COLOR_VERSION_FIXTURES="${CMAKE_CURRENT_SOURCE_DIR}/../../packages/timeline/tests/fixtures/working-color-space-versions.json")
    add_dependencies(tst_colorspaceversion nodetool-timeline)

    # Cache and client tests against an in-process HTTP server (no NodeTool server).
    foreach(test_name tst_assetcache tst_serverclient tst_autosave)
        nt_qt_test(${test_name} LIBS timeline_server Qt6::Test)
        set_tests_properties(${test_name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    endforeach()

endfunction()
nt_tests(nt_server_tests)
