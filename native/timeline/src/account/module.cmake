# The Account control (native cloud sign-in, WP1.11): the account service with
# its Qt half, its types registered with the timeline module, and the QML
# of the control and the cloud document views, which the node editor compiles
# from the same files.
set(NODETOOL_ACCOUNT_QT ON)
if(NOT TARGET nodetool_account_qt)
    add_subdirectory(../account ${CMAKE_CURRENT_BINARY_DIR}/account)
endif()
nt_qml_sources(src/account/AccountQmlTypes.h)
foreach(name AccountControl CloudDocumentsPanel CloudSyncStatus)
    set_source_files_properties(../account/qt/qml/${name}.qml PROPERTIES QT_RESOURCE_ALIAS ${name}.qml)
    nt_qml_files(../account/qt/qml/${name}.qml)
endforeach()
