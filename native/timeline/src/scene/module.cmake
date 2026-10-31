nt_sources(core
    src/scene/Animation.h
    src/scene/Animation.cpp
    src/scene/ClipScene.h
    src/scene/ClipScene.cpp
    src/scene/FlexLayout.h
    src/scene/FlexLayout.cpp
    src/scene/SvgPath.h
    src/scene/SvgPath.cpp
    src/scene/TextAnimation.h
    src/scene/TextAnimation.cpp
    src/scene/TextBlock.h
    src/scene/TextBlock.cpp
)

function(nt_scene_tests)
    # Native easing against the web's values (scene/Animation.h).
    nt_qt_test(tst_easing LIBS timeline_core Qt6::Test
        DEFINES NT_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/fixtures")
endfunction()
nt_tests(nt_scene_tests)
