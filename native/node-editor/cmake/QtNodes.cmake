include(FetchContent)
# QtNodes, BSD-3-Clause, at the upstream commit that added setNodeGeometry.
# AbstractGraphModel, BasicGraphicsScene, AbstractConnectionPainter,
# NodeGraphicsObject and UndoCommands reviewed at this immutable revision.
set(QT_NODES_DEVELOPER_DEFAULTS OFF CACHE BOOL "" FORCE)
set(BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(BUILD_DOCS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(QtNodes
    GIT_REPOSITORY https://github.com/paceholder/nodeeditor.git
    GIT_TAG 829b18457d4e95ac17f4fdb01c6201125681729d)
# Do not build upstream Catch2 tests with the host's BUILD_TESTING setting.
set(_host_testing ${BUILD_TESTING})
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
if(WIN32)
    # This revision omits DLL exports on NodeGraphicsObject methods the editor uses.
    set(_host_shared ${BUILD_SHARED_LIBS})
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
endif()
FetchContent_MakeAvailable(QtNodes)
if(WIN32)
    set(BUILD_SHARED_LIBS ${_host_shared} CACHE BOOL "" FORCE)
endif()
set(BUILD_TESTING ${_host_testing} CACHE BOOL "" FORCE)
