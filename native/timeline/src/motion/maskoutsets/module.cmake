function(nt_mask_outset_contract_tests)
    add_test(NAME mask_outset_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/maskoutsets/oracle.test.mjs")
endfunction()
nt_tests(nt_mask_outset_contract_tests)
