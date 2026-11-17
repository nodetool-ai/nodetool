// The hashing and encoding the sign-in flow and the local file layout need:
// SHA-256, base64url without padding, lower-case hex, and random bytes.
//
// Thread affinity: every function is thread-safe. None keeps state.
#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace nodetool::account {

using Sha256Digest = std::array<uint8_t, 32>;

Sha256Digest sha256(std::string_view data);

// RFC 4648 section 5, without '=' padding (RFC 7636 appendix A).
std::string base64UrlEncode(const uint8_t* data, size_t size);

std::string hexEncode(const uint8_t* data, size_t size);

// `count` bytes from the operating system's random source, through
// std::random_device, which reads getrandom(2), /dev/urandom or
// BCryptGenRandom on the supported standard libraries.
std::vector<uint8_t> randomBytes(size_t count);

// 256 random bits as base64url: 43 characters.
std::string randomToken();

// The server key of the local data scoping: the first 16 hex characters of
// SHA-256 of the server origin (technical design, "Local data scoping").
std::string serverKey(std::string_view serverOrigin);

} // namespace nodetool::account
