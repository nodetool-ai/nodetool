# The header that attaches a server token to a request to that server only
# (ServerToken.h). It needs Qt Network and nothing else from the account
# service, so a library without the account service, such as native chat,
# includes this file and links the target.
if(NOT TARGET nodetool_account_server_token)
  add_library(nodetool_account_server_token INTERFACE)
  target_sources(nodetool_account_server_token INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/include/nodetool/account/qt/ServerToken.h)
  target_include_directories(nodetool_account_server_token INTERFACE ${CMAKE_CURRENT_LIST_DIR}/include)
  target_link_libraries(nodetool_account_server_token INTERFACE Qt6::Core Qt6::Network)
endif()
