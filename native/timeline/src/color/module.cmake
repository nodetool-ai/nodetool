nt_qml_sources(src/color/ScopeMath.h src/color/ScopeMath.cpp src/color/ScopePaint.cpp
    src/color/ScopeNumbers.h src/color/ScopeNumbers.cpp
    src/color/ColorMatch.h src/color/ColorMatch.cpp)
function(nt_color_tests)
    qt_add_executable(tst_scopemath src/color/tst_scopemath.cpp
        src/color/ScopeMath.cpp src/color/ScopePaint.cpp src/color/ScopeNumbers.cpp)
    qt_add_executable(tst_colormatch src/color/tst_colormatch.cpp src/color/ColorMatch.cpp)
    foreach(target tst_scopemath tst_colormatch)
        set_target_properties(${target} PROPERTIES MACOSX_BUNDLE FALSE)
        target_compile_options(${target} PRIVATE ${NT_WARNINGS})
        target_link_libraries(${target} PRIVATE timeline_decode Qt6::Gui Qt6::Test)
        add_test(NAME ${target} COMMAND ${target})
        set_tests_properties(${target} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
    endforeach()
endfunction()
nt_tests(nt_color_tests)
