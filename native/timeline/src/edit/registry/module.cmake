nt_sources(core src/edit/registry/TargetingEditAdapter.h src/edit/registry/TargetingEditAdapter.cpp)
nt_sources(app src/edit/registry/EditRegistryCheck.cpp src/edit/registry/RippleRegistrations.cpp)
foreach(target structure-ops tst_fclipboard tst_editregistry targeting-ops tst_targeting)
    nt_sources(${target} src/edit/registry/RippleRegistrations.cpp)
endforeach()

function(nt_registry_targeting_sources)
    # M creates these targets after this module's callback, without nt_target_sources.
    foreach(target targeting-ops tst_targeting)
        if(TARGET ${target})
            nt_target_sources(${target})
        endif()
    endforeach()
endfunction()
cmake_language(DEFER DIRECTORY ${CMAKE_SOURCE_DIR} CALL nt_registry_targeting_sources)

function(nt_registry_tests)
    # These are the app's edit registrars, including the QML source contribution.
    qt_add_executable(tst_editregistry src/edit/registry/tst_editregistry.cpp
        src/app/BuiltinEdits.cpp
        src/edit/clipboard/ClipboardRegistrations.cpp
        src/edit/groups/GroupRegistrations.cpp
        src/edit/keyframes/KeyframeEdits.cpp
        src/edit/targeting/TargetingEditRegistrations.cpp
        src/edit/tracks/TrackEditRegistrations.cpp
        src/edit/transitions/TransitionRegistrations.cpp)
    nt_target_sources(tst_editregistry)
    target_link_libraries(tst_editregistry PRIVATE timeline_core Qt6::Test)
    set_target_properties(tst_editregistry PROPERTIES MACOSX_BUNDLE FALSE)
    add_test(NAME tst_editregistry COMMAND tst_editregistry)
    add_test(NAME edit_registry_check COMMAND $<TARGET_FILE:nodetool-timeline> --check-edit-registry)
    set_tests_properties(tst_editregistry edit_registry_check PROPERTIES
        ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 30)
endfunction()
nt_tests(nt_registry_tests)
