# The Account control (native cloud sign-in, WP1.11): the account service with
# its Qt half, its types registered with the timeline module, and the QML
# of the control, the cloud document views and the review sheet, which the node editor compiles
# from the same files.
set(NODETOOL_ACCOUNT_QT ON)
if(NOT TARGET nodetool_account_qt)
    add_subdirectory(../account ${CMAKE_CURRENT_BINARY_DIR}/account)
endif()
nt_qml_sources(src/account/AccountQmlTypes.h src/account/CloudTimelineSaver.h src/account/CloudTimelineSaver.cpp
    src/account/TransferMenu.cpp src/account/AccountMenu.cpp)
foreach(name AccountControl CloudDocumentsPanel CloudSyncStatus ProjectLockBanner ShareDialog SharePanel TransferDialog TransferPanel)
    set_source_files_properties(../account/qt/qml/${name}.qml PROPERTIES QT_RESOURCE_ALIAS ${name}.qml)
    nt_qml_files(../account/qt/qml/${name}.qml)
endforeach()
