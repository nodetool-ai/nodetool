// The one form of a cloud server origin that a credential is bound to:
// `https://<host>[:<port>]`, with the scheme and host in lower case and the
// default port left out. A credential is sent only to a URL whose origin
// is equal to its session's origin in this form.
#pragma once

#include <optional>
#include <string>
#include <string_view>

namespace nodetool::account {

// The canonical form of `origin`, which may end in one `/`. Nullopt for
// anything that is not an HTTPS origin: another scheme, user information,
// a path, a query, a fragment, an empty host, a bad port, or a space,
// control character or backslash anywhere.
std::optional<std::string> canonicalHttpsOrigin(std::string_view origin);

// The canonical origin of an absolute HTTPS URL. Nullopt under the same
// rules, except that a path, query and fragment are allowed.
std::optional<std::string> httpsOriginOfUrl(std::string_view url);

} // namespace nodetool::account
