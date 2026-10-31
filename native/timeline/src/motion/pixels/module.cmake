function(nt_motion_pixel_tests)
    add_test(NAME motion_pixels_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/pixels/oracle.test.mjs")
endfunction()
nt_tests(nt_motion_pixel_tests)
