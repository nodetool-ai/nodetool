nt_sources(server
    src/server/ServerIdentity/ServerIdentity.h
    src/server/ServerIdentity/ServerIdentity.cpp
)
function(nt_server_identity_tests)
    nt_qt_test(tst_serveridentity LIBS timeline_server Qt6::Test)
    set_tests_properties(tst_serveridentity PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
endfunction()
nt_tests(nt_server_identity_tests)
