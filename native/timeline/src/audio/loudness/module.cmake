nt_sources(audio
    src/audio/loudness/Loudness.h src/audio/loudness/Loudness.cpp
    src/audio/loudness/Ducking.h src/audio/loudness/Ducking.cpp
    src/audio/loudness/LiveLoudness.h src/audio/loudness/LiveLoudness.cpp)

function(nt_loudness_tests)
    foreach(name tst_loudness tst_ducking tst_liveloudness tst_loudnessengine)
        qt_add_executable(${name} src/audio/loudness/${name}.cpp)
        set_target_properties(${name} PROPERTIES MACOSX_BUNDLE FALSE)
        target_link_libraries(${name} PRIVATE timeline_core timeline_audio Qt6::Test)
        add_test(NAME ${name} COMMAND ${name})
        set_tests_properties(${name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    endforeach()
endfunction()
nt_tests(nt_loudness_tests)
