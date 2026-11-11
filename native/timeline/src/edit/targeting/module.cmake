nt_sources(core
    src/edit/targeting/TrackTargeting.h src/edit/targeting/TrackTargeting.cpp
    src/edit/targeting/TargetingEdits.h src/edit/targeting/TargetingEdits.cpp
    src/edit/targeting/RangeSplit.h src/edit/targeting/RangeSplit.cpp)
nt_sources(app src/edit/targeting/TargetingEditRegistrations.cpp)
nt_qml_sources(src/edit/targeting/TrackTargetingQml.h)

function(nt_targeting_tests)
    qt_add_executable(targeting-ops src/edit/targeting/TargetingOpsCli.cpp
        src/edit/targeting/TargetingEditRegistrations.cpp src/app/BuiltinEdits.cpp)
    target_link_libraries(targeting-ops PRIVATE timeline_core)
    set_target_properties(targeting-ops PROPERTIES MACOSX_BUNDLE FALSE)

    qt_add_executable(tst_targeting src/edit/targeting/tst_targeting.cpp
        src/edit/targeting/TargetingEditRegistrations.cpp src/app/BuiltinEdits.cpp)
    target_link_libraries(tst_targeting PRIVATE timeline_core Qt6::Test)
    set_target_properties(tst_targeting PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_targeting COMMAND tst_targeting)
    set_tests_properties(tst_targeting PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_targeting_tests)
