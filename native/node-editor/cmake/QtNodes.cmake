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
FetchContent_MakeAvailable(QtNodes)
set(BUILD_TESTING ${_host_testing} CACHE BOOL "" FORCE)
