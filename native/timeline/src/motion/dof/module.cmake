function(nt_dof_contract_tests)
    add_test(NAME dof_contract COMMAND node --test "${CMAKE_CURRENT_SOURCE_DIR}/src/motion/dof/oracle.test.mjs")
endfunction()
nt_tests(nt_dof_contract_tests)
