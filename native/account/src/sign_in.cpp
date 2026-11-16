#include "nodetool/account/sign_in.h"

#include "nodetool/account/crypto.h"

#include <array>
#include <cstring>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
using SocketHandle = SOCKET;
using PollFd = WSAPOLLFD;
#define NT_POLL WSAPoll
#define NT_CLOSE closesocket
constexpr SocketHandle kNoSocket = INVALID_SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>
using SocketHandle = int;
using PollFd = pollfd;
#define NT_POLL poll
#define NT_CLOSE close
constexpr SocketHandle kNoSocket = -1;
#endif

namespace nodetool::account {
namespace {

SocketHandle asSocket(intptr_t value) { return static_cast<SocketHandle>(value); }

// Largest request line and headers read from the browser.
constexpr size_t kMaxRequestBytes = 16 * 1024;
// How long one browser connection may take to send its request.
constexpr int kRequestTimeoutMs = 5000;

constexpr std::string_view kDonePage =
    "<!doctype html><meta charset=\"utf-8\"><title>NodeTool</title>"
    "<body style=\"font-family:sans-serif;padding:2em\">"
    "<p>You can close this tab and return to NodeTool.</p></body>";

int pollOne(PollFd* fds, size_t count, int timeoutMs) {
#ifdef _WIN32
  return NT_POLL(fds, static_cast<ULONG>(count), timeoutMs);
#else
  return NT_POLL(fds, static_cast<nfds_t>(count), timeoutMs);
#endif
}

void sendAll(SocketHandle s, std::string_view data) {
  size_t done = 0;
  while (done < data.size()) {
#ifdef _WIN32
    const int n = ::send(s, data.data() + done, static_cast<int>(data.size() - done), 0);
#else
    const ssize_t n = ::send(s, data.data() + done, data.size() - done, MSG_NOSIGNAL);
#endif
    if (n <= 0) {
      return;
    }
    done += static_cast<size_t>(n);
  }
}

// The request target of the first request line, or empty.
std::string readRequestTarget(SocketHandle client) {
  std::string buffer;
  std::array<char, 2048> chunk{};
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(kRequestTimeoutMs);
  while (buffer.find("\r\n") == std::string::npos && buffer.size() < kMaxRequestBytes) {
    const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(
                          deadline - std::chrono::steady_clock::now())
                          .count();
    if (left <= 0) {
      return {};
    }
    PollFd fd{};
    fd.fd = client;
    fd.events = POLLIN;
    if (pollOne(&fd, 1, static_cast<int>(left)) <= 0) {
      return {};
    }
#ifdef _WIN32
    const int n = ::recv(client, chunk.data(), static_cast<int>(chunk.size()), 0);
#else
    const ssize_t n = ::recv(client, chunk.data(), chunk.size(), 0);
#endif
    if (n <= 0) {
      return {};
    }
    buffer.append(chunk.data(), static_cast<size_t>(n));
  }
  const auto lineEnd = buffer.find("\r\n");
  if (lineEnd == std::string::npos) {
    return {};
  }
  const std::string_view line(buffer.data(), lineEnd);
  if (!line.starts_with("GET ")) {
    return {};
  }
  const auto targetEnd = line.find(' ', 4);
  return std::string(line.substr(4, targetEnd == std::string_view::npos ? line.npos : targetEnd - 4));
}

int hexValue(char c) {
  if (c >= '0' && c <= '9') {
    return c - '0';
  }
  if (c >= 'a' && c <= 'f') {
    return c - 'a' + 10;
  }
  if (c >= 'A' && c <= 'F') {
    return c - 'A' + 10;
  }
  return -1;
}

std::string defaultDeviceName(std::string_view deviceName) {
  return deviceName.empty() ? std::string("This computer") : std::string(deviceName);
}

} // namespace

// ── PKCE and URLs ────────────────────────────────────────────────────────

std::string pkceChallenge(std::string_view verifier) {
  const auto digest = sha256(verifier);
  return base64UrlEncode(digest.data(), digest.size());
}

Pkce makePkce() {
  Pkce pkce;
  pkce.verifier = randomToken();
  pkce.challenge = pkceChallenge(pkce.verifier);
  return pkce;
}

std::string urlEncode(std::string_view value) {
  static constexpr char kDigits[] = "0123456789ABCDEF";
  std::string out;
  for (const char ch : value) {
    const auto c = static_cast<unsigned char>(ch);
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' ||
        c == '_' || c == '~') {
      out.push_back(static_cast<char>(c));
    } else {
      out.push_back('%');
      out.push_back(kDigits[c >> 4]);
      out.push_back(kDigits[c & 15]);
    }
  }
  return out;
}

std::string urlDecode(std::string_view value) {
  std::string out;
  for (size_t i = 0; i < value.size(); ++i) {
    if (value[i] == '+') {
      out.push_back(' ');
    } else if (value[i] == '%' && i + 2 < value.size() && hexValue(value[i + 1]) >= 0 && hexValue(value[i + 2]) >= 0) {
      out.push_back(static_cast<char>(hexValue(value[i + 1]) * 16 + hexValue(value[i + 2])));
      i += 2;
    } else {
      out.push_back(value[i]);
    }
  }
  return out;
}

std::string authorizeUrl(const AuthorizeRequest& r) {
  std::string url = r.serverOrigin + "/oauth/authorize";
  url += "?response_type=code";
  url += "&client_id=" + urlEncode(kNativeClientId);
  url += "&scope=" + urlEncode(kNativeScope);
  url += "&redirect_uri=" + urlEncode(r.redirectUri);
  url += "&code_challenge=" + urlEncode(r.codeChallenge);
  url += "&code_challenge_method=S256";
  url += "&state=" + urlEncode(r.state);
  url += "&resource=" + urlEncode(r.serverOrigin);
  url += "&app=" + urlEncode(r.app);
  url += "&device_name=" + urlEncode(r.deviceName);
  return url;
}

CallbackResult parseCallback(std::string_view target, std::string_view expectedState) {
  CallbackResult result;
  const auto question = target.find('?');
  const std::string_view path = target.substr(0, question);
  if (path != "/callback" || question == std::string_view::npos) {
    return result;
  }
  std::string code;
  std::string state;
  std::string error;
  std::string description;
  bool hasState = false;
  std::string_view query = target.substr(question + 1);
  while (!query.empty()) {
    const auto amp = query.find('&');
    const std::string_view pair = query.substr(0, amp);
    query = amp == std::string_view::npos ? std::string_view{} : query.substr(amp + 1);
    const auto eq = pair.find('=');
    const std::string key = urlDecode(pair.substr(0, eq));
    const std::string value = eq == std::string_view::npos ? std::string() : urlDecode(pair.substr(eq + 1));
    if (key == "code") {
      code = value;
    } else if (key == "state") {
      state = value;
      hasState = true;
    } else if (key == "error") {
      error = value;
    } else if (key == "error_description") {
      description = value;
    }
  }
  if (!hasState || state != expectedState) {
    result.kind = CallbackResult::Kind::StateMismatch;
    return result;
  }
  if (!error.empty()) {
    result.kind = CallbackResult::Kind::Denied;
    result.error = error;
    result.errorDescription = description;
    return result;
  }
  if (code.empty()) {
    return result;
  }
  result.kind = CallbackResult::Kind::Code;
  result.code = code;
  return result;
}

// ── LoopbackListener ─────────────────────────────────────────────────────

std::unique_ptr<LoopbackListener> LoopbackListener::open() {
#ifdef _WIN32
  WSADATA data;
  if (WSAStartup(MAKEWORD(2, 2), &data) != 0) {
    return nullptr;
  }
#endif
  auto listener = std::make_unique<LoopbackListener>(Private{});
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  addr.sin_port = 0;

  const SocketHandle s = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == kNoSocket) {
    return nullptr;
  }
  listener->socket_ = static_cast<intptr_t>(s);
  if (::bind(s, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0 || ::listen(s, 8) != 0) {
    return nullptr;
  }
  sockaddr_in bound{};
  socklen_t len = sizeof(bound);
  if (::getsockname(s, reinterpret_cast<sockaddr*>(&bound), &len) != 0) {
    return nullptr;
  }
  listener->port_ = ntohs(bound.sin_port);

  // cancel() sends one datagram from wakeWrite_ to wakeRead_, which the wait
  // polls beside the listening socket. Both are loopback UDP sockets, which
  // every supported platform can poll.
  const SocketHandle wakeRead = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (wakeRead == kNoSocket) {
    return nullptr;
  }
  listener->wakeRead_ = static_cast<intptr_t>(wakeRead);
  if (::bind(wakeRead, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    return nullptr;
  }
  sockaddr_in wakeAddr{};
  len = sizeof(wakeAddr);
  if (::getsockname(wakeRead, reinterpret_cast<sockaddr*>(&wakeAddr), &len) != 0) {
    return nullptr;
  }
  const SocketHandle wakeWrite = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (wakeWrite == kNoSocket) {
    return nullptr;
  }
  listener->wakeWrite_ = static_cast<intptr_t>(wakeWrite);
  if (::connect(wakeWrite, reinterpret_cast<sockaddr*>(&wakeAddr), sizeof(wakeAddr)) != 0) {
    return nullptr;
  }
  return listener;
}

LoopbackListener::~LoopbackListener() {
  for (intptr_t* handle : {&socket_, &wakeRead_, &wakeWrite_}) {
    if (*handle != -1) {
      NT_CLOSE(asSocket(*handle));
      *handle = -1;
    }
  }
#ifdef _WIN32
  WSACleanup();
#endif
}

std::string LoopbackListener::redirectUri() const {
  return "http://127.0.0.1:" + std::to_string(port_) + "/callback";
}

void LoopbackListener::cancel() {
  const char byte = 1;
  ::send(asSocket(wakeWrite_), &byte, 1, 0);
}

std::optional<CallbackResult> LoopbackListener::waitForCallback(std::string_view expectedState,
                                                                std::chrono::milliseconds timeout) {
  const auto deadline = std::chrono::steady_clock::now() + timeout;
  for (;;) {
    const auto left =
        std::chrono::duration_cast<std::chrono::milliseconds>(deadline - std::chrono::steady_clock::now())
            .count();
    if (left <= 0) {
      return std::nullopt;
    }
    std::array<PollFd, 2> fds{};
    fds[0].fd = asSocket(socket_);
    fds[0].events = POLLIN;
    fds[1].fd = asSocket(wakeRead_);
    fds[1].events = POLLIN;
    const int ready = pollOne(fds.data(), fds.size(), static_cast<int>(left));
    if (ready < 0) {
      return std::nullopt;
    }
    if (fds[1].revents != 0) {
      return std::nullopt;
    }
    if ((fds[0].revents & POLLIN) == 0) {
      continue;
    }
    const SocketHandle client = ::accept(asSocket(socket_), nullptr, nullptr);
    if (client == kNoSocket) {
      continue;
    }
    const std::string target = readRequestTarget(client);
    const CallbackResult result = parseCallback(target, expectedState);
    if (result.kind == CallbackResult::Kind::NotCallback) {
      sendAll(client, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
      NT_CLOSE(client);
      continue;
    }
    std::string response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ";
    response += std::to_string(kDonePage.size());
    response += "\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n";
    response += kDonePage;
    sendAll(client, response);
    NT_CLOSE(client);
    if (result.kind == CallbackResult::Kind::StateMismatch) {
      // Not this flow's browser tab. Keep waiting for the right one.
      continue;
    }
    return result;
  }
}

// ── SignInFlow ───────────────────────────────────────────────────────────

SignInFlow::SignInFlow(SecretStore& store, TokenEndpoint& endpoint, AccountSessionOptions options)
    : store_(store), endpoint_(endpoint), options_(std::move(options)) {}

std::optional<std::string> SignInFlow::begin(std::string_view app, std::string_view deviceName) {
  listener_ = LoopbackListener::open();
  if (!listener_) {
    return std::nullopt;
  }
  pkce_ = makePkce();
  state_ = randomToken();
  return authorizeUrl({options_.serverOrigin, listener_->redirectUri(), pkce_.challenge, state_,
                       std::string(app), defaultDeviceName(deviceName)});
}

void SignInFlow::cancel() {
  if (listener_) {
    listener_->cancel();
  }
}

SignInResult SignInFlow::finish(std::chrono::milliseconds timeout) {
  SignInResult out;
  if (!listener_) {
    return out;
  }
  const auto callback = listener_->waitForCallback(state_, timeout);
  const std::string redirectUri = listener_->redirectUri();
  listener_.reset();
  if (!callback) {
    out.status = SignInStatus::TimedOut;
    return out;
  }
  if (callback->kind == CallbackResult::Kind::Denied) {
    out.status = SignInStatus::Denied;
    out.message = callback->errorDescription.empty() ? callback->error : callback->errorDescription;
    return out;
  }
  const TokenResult result = endpoint_.exchangeCode({callback->code, pkce_.verifier, redirectUri, options_.serverOrigin});
  if (result.status != TokenStatus::Ok || result.tokens.userId.empty() ||
      result.tokens.revocationHandle.empty()) {
    out.message = result.message;
    return out;
  }
  if (!recordSignIn(store_, options_, result.tokens)) {
    out.message = "The sign-in could not be stored on this computer.";
    return out;
  }
  out.status = SignInStatus::SignedIn;
  out.userId = result.tokens.userId;
  out.displayName = result.tokens.displayName;
  return out;
}

} // namespace nodetool::account
