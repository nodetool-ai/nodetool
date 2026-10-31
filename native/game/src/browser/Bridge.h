#pragma once
#include <cstdint>
extern "C" {
// During dispatch, create returns 0, dispatch returns -2, and destroy is ignored.
std::uint32_t ng_create();
int ng_dispatch(std::uint32_t context, const char *request, std::uint32_t requestBytes);
const char *ng_response_pointer(std::uint32_t context);
std::uint32_t ng_response_length(std::uint32_t context);
void ng_destroy(std::uint32_t context);
}
