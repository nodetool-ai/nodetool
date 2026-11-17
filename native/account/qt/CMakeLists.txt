# The Qt half of the account service: the HTTP transport over
# QNetworkAccessManager and the AccountController QML binds to. Built when
# NODETOOL_ACCOUNT_QT is on. A parent app that links it has found Qt
# already.
find_package(Qt6 6.12 REQUIRED COMPONENTS Core Network)

add_library(nodetool_account_qt STATIC
  src/AccountController.cpp
  include/nodetool/account/qt/AccountController.h
  src/AccountServers.cpp
  include/nodetool/account/qt/AccountServers.h
  src/CloudBrowser.cpp
  include/nodetool/account/qt/CloudBrowser.h
  src/CloudDocument.cpp
  include/nodetool/account/qt/CloudDocument.h
  src/ShareController.cpp
  include/nodetool/account/qt/ShareController.h
  src/QtHttpTransport.cpp
  include/nodetool/account/qt/QtHttpTransport.h
  src/TaskQueue.h)
# The header that attaches a server token to a request to that server only.
# It needs Qt Network and nothing else from the account service, so the
# timeline's server client links this target alone.
add_library(nodetool_account_server_token INTERFACE)
target_sources(nodetool_account_server_token INTERFACE
  ${CMAKE_CURRENT_SOURCE_DIR}/include/nodetool/account/qt/ServerToken.h)
target_include_directories(nodetool_account_server_token INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(nodetool_account_server_token INTERFACE Qt6::Core Qt6::Network)
target_link_libraries(nodetool_account_qt PUBLIC nodetool_account_server_token)
set_target_properties(nodetool_account_qt PROPERTIES AUTOMOC ON)
target_include_directories(nodetool_account_qt PUBLIC include)
target_link_libraries(nodetool_account_qt PUBLIC nodetool_account Qt6::Core Qt6::Network)
# A QML module that registers AccountController with QML_FOREIGN reads its
# properties from these metatypes.
qt_extract_metatypes(nodetool_account_qt)

if(PROJECT_IS_TOP_LEVEL)
  find_package(Qt6 6.12 REQUIRED COMPONENTS Test)
  # The transport against a local HTTP server, and two controllers standing
  # in for the two apps against the fake token server: TC1's second app,
  # sign-out reaching the other app, and TC91's policy half.
  add_executable(account_qt_tests tests/tst_account_qt.cpp tests/header_alone.cpp)
  set_target_properties(account_qt_tests PROPERTIES AUTOMOC ON)
  target_link_libraries(account_qt_tests PRIVATE nodetool_account_qt Qt6::Test)
  target_include_directories(account_qt_tests PRIVATE ../tests)
  add_test(NAME account_qt_tests COMMAND account_qt_tests)
  set(account_qt_test_env "QT_QPA_PLATFORM=offscreen")
  if(NODETOOL_ACCOUNT_TSAN)
    # Qt and the libraries it loads are uninstrumented. The file suppresses
    # reports inside them only (tests/tsan.supp).
    list(APPEND account_qt_test_env
      "TSAN_OPTIONS=suppressions=${CMAKE_CURRENT_SOURCE_DIR}/tests/tsan.supp halt_on_error=1")
  endif()
  set_tests_properties(account_qt_tests PROPERTIES ENVIRONMENT "${account_qt_test_env}")
endif()
