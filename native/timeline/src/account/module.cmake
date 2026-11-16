# The Account control (native cloud sign-in, WP1.11): the account service with
# its Qt half, AccountController registered with the timeline module, and the
# control's QML, which the node editor compiles from the same file.
set(NODETOOL_ACCOUNT_QT ON)
if(NOT TARGET nodetool_account_qt)
    add_subdirectory(../account ${CMAKE_CURRENT_BINARY_DIR}/account)
endif()
nt_qml_sources(src/account/AccountQmlTypes.h)
set_source_files_properties(../account/qt/qml/AccountControl.qml PROPERTIES QT_RESOURCE_ALIAS AccountControl.qml)
nt_qml_files(../account/qt/qml/AccountControl.qml)
