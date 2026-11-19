function(nt_scratchpool_tests)
    qt_add_executable(tst_scratchpool src/motion/capacity/tst_scratchpool.cpp)
    # ScratchPool.h and SurfacePool.h are headers of nodetool_timeline_decode.
    target_link_libraries(tst_scratchpool PRIVATE nodetool_timeline_decode Qt6::Gui Qt6::GuiPrivate Qt6::Test)
    add_test(NAME tst_scratchpool COMMAND tst_scratchpool)
endfunction()
nt_tests(nt_scratchpool_tests)

function(nt_effectscratch_tests)
    qt_add_executable(tst_effectscratch src/motion/capacity/tst_effectscratch.cpp)
    target_link_libraries(tst_effectscratch PRIVATE timeline_decode Qt6::Test)
    add_test(NAME tst_effectscratch COMMAND tst_effectscratch)
endfunction()

nt_tests(nt_effectscratch_tests)
