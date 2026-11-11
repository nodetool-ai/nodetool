nt_sources(server
    src/server/sync/DocumentApplier.h
    src/server/sync/DocumentApplier.cpp
    src/server/sync/ResourceChangeClient.h
    src/server/sync/ResourceChangeClient.cpp
    src/server/sync/TimelineMerge.h
    src/server/sync/TimelineMerge.cpp
)

function(nt_sync_tests)
    qt_add_executable(tst_sync src/server/sync/tst_sync.cpp)
    target_link_libraries(tst_sync PRIVATE timeline_server Qt6::Test)
    target_include_directories(tst_sync PRIVATE tests)
    set_target_properties(tst_sync PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_sync COMMAND tst_sync)
    set_tests_properties(tst_sync PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_sync_tests)

nt_sources(app src/server/sync/SyncRegistration.cpp src/server/sync/ExternalConflictsPanel.cpp)
function(nt_syncmodel_tests)
    qt_add_executable(tst_syncmodel src/server/sync/tst_syncmodel.cpp src/server/sync/SyncRegistration.cpp
        src/server/sync/ExternalConflictsPanel.cpp)
    foreach(target IN ITEMS nodetool-timeline tst_syncmodel)
        qt_add_resources(${target} nt_sync_banner
            PREFIX /nodetool/sync BASE src/server/sync
            FILES src/server/sync/ExternalConflictsBanner.qml)
    endforeach()
    target_link_libraries(tst_syncmodel PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 Qt6::Test PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(tst_syncmodel OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/tst_syncmodel_qml/NodeTool/Timeline)
    if(UNIX AND NOT APPLE)
        target_sources(tst_syncmodel PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    endif()
    target_include_directories(tst_syncmodel PRIVATE tests)
    set_target_properties(tst_syncmodel PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_syncmodel COMMAND tst_syncmodel)
    set_tests_properties(tst_syncmodel PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_syncmodel_tests)

function(nt_sync_e2e_host)
    qt_add_executable(sync-e2e-host src/server/sync/SyncE2eHost.cpp src/server/sync/SyncRegistration.cpp)
    target_link_libraries(sync-e2e-host PRIVATE timeline_core timeline_decode timeline_audio timeline_server
        Qt6::Gui Qt6::GuiPrivate Qt6::Qml Qt6::Quick Qt6::QuickControls2 PkgConfig::FFMPEG ${NT_APP_PLATFORM_LIBS})
    nt_add_timeline_qml(sync-e2e-host OUTPUT_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/sync_e2e_qml/NodeTool/Timeline)
    # SyncE2eHost.cpp calls hw::prepareWindow on every platform.
    target_sources(sync-e2e-host PRIVATE src/preview/hw/HwWindow.h src/preview/hw/HwWindow.cpp)
    set_target_properties(sync-e2e-host PROPERTIES MACOSX_BUNDLE FALSE)
endfunction()
nt_tests(nt_sync_e2e_host)
