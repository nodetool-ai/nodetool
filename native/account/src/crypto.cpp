#include "nodetool/account/crypto.h"

#include <random>

namespace nodetool::account {
namespace {

constexpr std::array<uint32_t, 64> kRound = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};

constexpr uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

void compress(std::array<uint32_t, 8>& h, const uint8_t* block) {
  std::array<uint32_t, 64> w{};
  for (int i = 0; i < 16; ++i) {
    w[i] = (uint32_t{block[i * 4]} << 24) | (uint32_t{block[i * 4 + 1]} << 16) |
           (uint32_t{block[i * 4 + 2]} << 8) | uint32_t{block[i * 4 + 3]};
  }
  for (int i = 16; i < 64; ++i) {
    const uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
    const uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (int i = 0; i < 64; ++i) {
    const uint32_t s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const uint32_t ch = (e & f) ^ (~e & g);
    const uint32_t t1 = k + s1 + ch + kRound[i] + w[i];
    const uint32_t s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
    const uint32_t t2 = s0 + maj;
    k = g;
    g = f;
    f = e;
    e = d + t1;
    d = c;
    c = b;
    b = a;
    a = t1 + t2;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += d;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += k;
}

} // namespace

Sha256Digest sha256(std::string_view data) {
  std::array<uint32_t, 8> h = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                               0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  const auto* bytes = reinterpret_cast<const uint8_t*>(data.data());
  const size_t size = data.size();
  size_t offset = 0;
  for (; offset + 64 <= size; offset += 64) {
    compress(h, bytes + offset);
  }
  std::array<uint8_t, 128> tail{};
  const size_t rest = size - offset;
  for (size_t i = 0; i < rest; ++i) {
    tail[i] = bytes[offset + i];
  }
  tail[rest] = 0x80;
  const size_t tailSize = rest < 56 ? 64 : 128;
  const uint64_t bits = static_cast<uint64_t>(size) * 8;
  for (int i = 0; i < 8; ++i) {
    tail[tailSize - 1 - i] = static_cast<uint8_t>(bits >> (8 * i));
  }
  compress(h, tail.data());
  if (tailSize == 128) {
    compress(h, tail.data() + 64);
  }
  Sha256Digest out{};
  for (int i = 0; i < 8; ++i) {
    out[i * 4] = static_cast<uint8_t>(h[i] >> 24);
    out[i * 4 + 1] = static_cast<uint8_t>(h[i] >> 16);
    out[i * 4 + 2] = static_cast<uint8_t>(h[i] >> 8);
    out[i * 4 + 3] = static_cast<uint8_t>(h[i]);
  }
  return out;
}

std::string base64UrlEncode(const uint8_t* data, size_t size) {
  static constexpr char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  std::string out;
  out.reserve((size * 4 + 2) / 3);
  size_t i = 0;
  for (; i + 3 <= size; i += 3) {
    const uint32_t n = (uint32_t{data[i]} << 16) | (uint32_t{data[i + 1]} << 8) | data[i + 2];
    out.push_back(kAlphabet[(n >> 18) & 63]);
    out.push_back(kAlphabet[(n >> 12) & 63]);
    out.push_back(kAlphabet[(n >> 6) & 63]);
    out.push_back(kAlphabet[n & 63]);
  }
  if (size - i == 1) {
    const uint32_t n = uint32_t{data[i]} << 16;
    out.push_back(kAlphabet[(n >> 18) & 63]);
    out.push_back(kAlphabet[(n >> 12) & 63]);
  } else if (size - i == 2) {
    const uint32_t n = (uint32_t{data[i]} << 16) | (uint32_t{data[i + 1]} << 8);
    out.push_back(kAlphabet[(n >> 18) & 63]);
    out.push_back(kAlphabet[(n >> 12) & 63]);
    out.push_back(kAlphabet[(n >> 6) & 63]);
  }
  return out;
}

std::string hexEncode(const uint8_t* data, size_t size) {
  static constexpr char kDigits[] = "0123456789abcdef";
  std::string out;
  out.reserve(size * 2);
  for (size_t i = 0; i < size; ++i) {
    out.push_back(kDigits[data[i] >> 4]);
    out.push_back(kDigits[data[i] & 15]);
  }
  return out;
}

std::vector<uint8_t> randomBytes(size_t count) {
  std::random_device device;
  std::vector<uint8_t> out(count);
  size_t i = 0;
  while (i < count) {
    const uint32_t word = device();
    for (int b = 0; b < 4 && i < count; ++b, ++i) {
      out[i] = static_cast<uint8_t>(word >> (8 * b));
    }
  }
  return out;
}

std::string randomToken() {
  const auto bytes = randomBytes(32);
  return base64UrlEncode(bytes.data(), bytes.size());
}

std::string serverKey(std::string_view serverOrigin) {
  const auto digest = sha256(serverOrigin);
  return hexEncode(digest.data(), digest.size()).substr(0, 16);
}

} // namespace nodetool::account
