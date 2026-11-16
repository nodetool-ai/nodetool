#include "nodetool/account/origin.h"

#include <algorithm>
#include <cctype>

namespace nodetool::account {
namespace {

std::string lower(std::string_view s) {
  std::string out(s);
  std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return std::tolower(c); });
  return out;
}

bool hostCharacter(char c) {
  const auto u = static_cast<unsigned char>(c);
  return std::isalnum(u) || c == '-' || c == '.';
}

// `authority` is everything between `https://` and the first `/`, `?` or
// `#`.
std::optional<std::string> canonicalAuthority(std::string_view authority) {
  if (authority.empty()) {
    return std::nullopt;
  }
  std::string_view host = authority;
  std::string_view port;
  if (authority.front() == '[') {
    const auto close = authority.find(']');
    if (close == std::string_view::npos) {
      return std::nullopt;
    }
    host = authority.substr(0, close + 1);
    const std::string_view rest = authority.substr(close + 1);
    if (!rest.empty()) {
      if (rest.front() != ':') {
        return std::nullopt;
      }
      port = rest.substr(1);
    }
    for (const char c : host.substr(1, host.size() - 2)) {
      if (!std::isxdigit(static_cast<unsigned char>(c)) && c != ':' && c != '.') {
        return std::nullopt;
      }
    }
  } else {
    const auto colon = authority.find(':');
    if (colon != std::string_view::npos) {
      host = authority.substr(0, colon);
      port = authority.substr(colon + 1);
    }
    if (host.empty() || !std::all_of(host.begin(), host.end(), hostCharacter) || host.front() == '.' ||
        host.front() == '-') {
      return std::nullopt;
    }
  }
  std::string out = "https://" + lower(host);
  if (authority.find(':') != std::string_view::npos && authority.front() != '[' && port.empty()) {
    return std::nullopt;
  }
  if (!port.empty()) {
    if (port.size() > 5 || !std::all_of(port.begin(), port.end(), [](char c) { return c >= '0' && c <= '9'; })) {
      return std::nullopt;
    }
    const int number = std::stoi(std::string(port));
    if (number < 1 || number > 65535) {
      return std::nullopt;
    }
    if (number != 443) {
      out += ":" + std::to_string(number);
    }
  }
  return out;
}

// Splits `https://<authority><rest>`. Nullopt when the scheme is not HTTPS,
// the authority holds user information, or the text holds a character no
// URL this library sends may hold.
std::optional<std::pair<std::string, std::string_view>> split(std::string_view url) {
  constexpr std::string_view scheme = "https://";
  if (url.size() < scheme.size() || lower(url.substr(0, scheme.size())) != scheme) {
    return std::nullopt;
  }
  for (const char c : url) {
    const auto u = static_cast<unsigned char>(c);
    if (u <= 0x20 || u == 0x7f || c == '\\') {
      return std::nullopt;
    }
  }
  const std::string_view afterScheme = url.substr(scheme.size());
  const auto end = afterScheme.find_first_of("/?#");
  const std::string_view authority = afterScheme.substr(0, end);
  if (authority.find('@') != std::string_view::npos) {
    return std::nullopt;
  }
  auto canonical = canonicalAuthority(authority);
  if (!canonical) {
    return std::nullopt;
  }
  return std::pair{std::move(*canonical),
                   end == std::string_view::npos ? std::string_view() : afterScheme.substr(end)};
}

} // namespace

std::optional<std::string> canonicalHttpsOrigin(std::string_view origin) {
  auto parts = split(origin);
  if (!parts || !(parts->second.empty() || parts->second == "/")) {
    return std::nullopt;
  }
  return std::move(parts->first);
}

std::optional<std::string> httpsOriginOfUrl(std::string_view url) {
  auto parts = split(url);
  if (!parts) {
    return std::nullopt;
  }
  return std::move(parts->first);
}

} // namespace nodetool::account
