// The managed policy (WP1.9, SR13): an administrator can turn the cloud
// features off, or allow sign-in to a list of servers only. Both apps read
// it before each sign-in and each time they open the Account control. Local
// work is never affected.
//
// | Platform | Location                                                    |
// |----------|-------------------------------------------------------------|
// | Linux    | `/etc/nodetool/policy.json`                                 |
// | macOS    | managed preferences, domain `ai.nodetool.native`            |
// | Windows  | `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\NodeTool\Native`      |
//
// Two keys, with the same names everywhere:
//
// | Key              | JSON and macOS     | Windows       | Absent            |
// |------------------|--------------------|---------------|-------------------|
// | `CloudEnabled`   | boolean            | REG_DWORD 0/1 | cloud features on |
// | `AllowedServers` | array of origins   | REG_MULTI_SZ  | any server        |
//
// For example `{"CloudEnabled": true, "AllowedServers": ["https://nodetool.example.com"]}`.
// A policy that exists and cannot be read turns the cloud features off, so a
// typing mistake never opens what the administrator meant to close.
#pragma once

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace nodetool::account {

struct ManagedPolicy {
  // Whether the platform location holds a policy at all.
  bool present = false;
  bool cloudEnabled = true;
  // Normalized origins. Empty allows every server.
  std::vector<std::string> allowedServers;
  // Why a present policy could not be read. The policy then has the cloud
  // features off.
  std::string error;
};

// Reads a policy from its JSON text. Unknown keys are ignored.
ManagedPolicy parsePolicyJson(std::string_view text);

// Reads the JSON policy file at `path`. A missing file is no policy.
ManagedPolicy readPolicyFile(const std::filesystem::path& path);

// Reads the policy from this platform's managed location.
ManagedPolicy readManagedPolicy();

// `https://Host.example:443/` reads as `https://host.example`: the scheme
// and host in lower case, the scheme's default port and any trailing slash
// dropped. Empty when `origin` is not an http or https origin.
std::string normalizeOrigin(std::string_view origin);

enum class PolicyDecision {
  Allowed,
  // The policy turns the cloud features off.
  CloudOff,
  // The policy names other servers.
  ServerNotAllowed,
};

struct PolicyCheck {
  PolicyDecision decision = PolicyDecision::Allowed;
  // Shown to the person when the decision is not Allowed.
  std::string reason;
};

// Whether the policy lets the app sign in to `serverOrigin`.
PolicyCheck checkServer(const ManagedPolicy& policy, std::string_view serverOrigin);

} // namespace nodetool::account
