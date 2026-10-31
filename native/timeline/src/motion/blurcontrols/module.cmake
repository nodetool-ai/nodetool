nt_sources(qml_resources src/motion/blurcontrols/MotionBlur.qml)
nt_qml_sources(src/motion/blurcontrols/MotionBlurSections.cpp)
function(nt_motion_blur_control_tests)
    add_test(NAME tst_motionblurcontrols COMMAND $<TARGET_FILE:tst_followpathui>
        -input ${CMAKE_CURRENT_SOURCE_DIR}/src/motion/blurcontrols/qmltests)
    set_tests_properties(tst_motionblurcontrols PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_motion_blur_control_tests)
function(nt_group_motion_blur_tests)
    add_test(NAME tst_groupmotionblur COMMAND $<TARGET_FILE:tst_followpathui>
        -input ${CMAKE_CURRENT_SOURCE_DIR}/src/motion/blurcontrols/groupqmltests)
    set_tests_properties(tst_groupmotionblur PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software")
endfunction()
nt_tests(nt_group_motion_blur_tests)
