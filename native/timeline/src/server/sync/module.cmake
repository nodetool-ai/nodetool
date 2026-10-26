nt_sources(server
    src/server/sync/ResourceChangeClient.h
    src/server/sync/ResourceChangeClient.cpp
    src/server/sync/TimelineMerge.h
    src/server/sync/TimelineMerge.cpp
)

function(nt_sync_tests)
    qt_add_executable(tst_sync src/server/sync/tst_sync.cpp)
    target_link_libraries(tst_sync PRIVATE timeline_server Qt6::Test)
    set_target_properties(tst_sync PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_sync COMMAND tst_sync)
    set_tests_properties(tst_sync PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_sync_tests)
