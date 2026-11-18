// The share dialog's calls and checks (technical design, "Native surfaces";
// PRD FR52, FR67, SR6): the links and people of one document, link changes,
// the sentence that says what a link gives, the documents a timeline links
// to, and a best-effort search for values that look like secrets.
//
// A workflow uses `workflows.sharing.*` with `{id}`. Every other kind uses
// `documentSharing.*` with `{type, id}`. Only the owner may call them.
#pragma once

#include "nodetool/account/cloud_client.h"
#include "nodetool/account/cloud_listing.h"

#include <string>
#include <vector>

namespace nodetool::account {

// What a viewer may do beyond opening the document. An editor may do all
// three.
struct ShareOptions {
  bool history = false;
  bool download = false;
  bool duplicate = false;
};

struct ShareLink {
  std::string id;
  std::string token;
  // `viewer` or `editor` (`public` for a workflow's public link).
  std::string role;
  bool disabled = false;
  ShareOptions options;
};

// One grant that gives a person access (PRD P3, P6).
struct ShareGrant {
  // `invitation`, `link` or another source the server names.
  std::string source;
  // The link of a link grant, else empty.
  std::string shareId;
  std::string role;
  ShareOptions options;
  // A link grant whose link admits nobody new. Its options stay live.
  bool linkDisabled = false;
};

struct SharePerson {
  std::string userId;
  std::string name;
  std::string email;
  // `editor` or `viewer`, the person's effective role.
  std::string role;
  // The effective options: on when any grant turns them on.
  ShareOptions options;
  // The grants that give the access.
  std::vector<ShareGrant> grants;
};

struct SharingState {
  CloudListStatus status = CloudListStatus::Offline;
  std::string reason;
  std::vector<ShareLink> links;
  std::vector<SharePerson> people;
};

struct ShareChange {
  CloudListStatus status = CloudListStatus::Offline;
  std::string reason;
  // The link a createLink or setLinkOptions returned.
  ShareLink link;
};

// The document's links, the enabled ones first, and its people.
SharingState readSharing(CloudClient& client, const std::string& kind, const std::string& id);
// The document's link for `role`. The server returns the existing one when
// there is one.
ShareChange createLink(CloudClient& client, const std::string& kind, const std::string& id, const std::string& role);
// Stops new people from joining. People who joined keep their access.
ShareChange disableLink(CloudClient& client, const std::string& kind, const std::string& id,
                        const std::string& shareId);
ShareChange setLinkOptions(CloudClient& client, const std::string& kind, const std::string& id,
                           const std::string& shareId, const ShareOptions& options);
// Sets `role` (`viewer` or `editor`) on every grant the person holds.
ShareChange setPersonRole(CloudClient& client, const std::string& kind, const std::string& id,
                          const std::string& userId, const std::string& role);
// Removes the person's grants. The person can no longer open the document.
ShareChange removePerson(CloudClient& client, const std::string& kind, const std::string& id,
                         const std::string& userId);

// The enabled link for `role`, or null.
const ShareLink* enabledLink(const SharingState& state, const std::string& role);

// The address a person opens, on the web app of `origin`.
std::string shareUrl(const std::string& origin, const std::string& kind, const std::string& token,
                     const std::string& role);

// What a link gives, in the dialog's words (FR52).
std::string linkStatement(const std::string& role, const ShareOptions& options);

// A document another document refers to (FR67).
struct LinkedDocument {
  // `script` or `storyboard`.
  std::string kind;
  std::string id;
};

// The scripts and storyboards a timeline's clips name, each once, in the
// order found. `documentJson` is the timeline document, or its read answer.
// Other kinds link to none.
std::vector<LinkedDocument> linkedDocuments(const std::string& kind, const std::string& documentJson);

// A value that looks like a secret (SR6), and where it is: for a workflow,
// the node and its property, otherwise the JSON path.
struct SecretFinding {
  std::string place;
  // What it looks like, such as "an OpenAI key".
  std::string looksLike;
};

// Best-effort: matches the shapes of common keys and tokens, and long
// values under names such as `api_key` or `password`. It reports each
// place once, and never the value.
std::vector<SecretFinding> findSecretLike(const std::string& kind, const std::string& documentJson);

} // namespace nodetool::account
