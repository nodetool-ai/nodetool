#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>
#include <QVariantList>

namespace nodetool {
// The node library's categories, in web order. The first entry, "all", holds every node.
// Source: web/src/config/quickAccessCategories.tsx, NODE_SUBCATEGORIES.
QVariantList catalogCategories();
// The ids of the categories a node belongs to, without "all". A node can match several.
QStringList catalogCategoryIds(const QJsonObject &metadata);
// The provider filter id of a namespace: the root of an API-backed namespace
// ("fal", "openai"), or "local" for a node that runs on this machine.
// Source: web/src/utils/nodeProvider.ts getNodeProviderId.
QString catalogProviderId(const QString &nameSpace);
// The provider filter label, such as "FAL", "xAI" or "Local".
// Source: web/src/utils/nodeProvider.ts getNodeProviderName.
QString catalogProviderName(const QString &providerId);
// The secret a namespace waits on before the node library lists its nodes, or
// empty when it needs none. Sign-in and machine gates (Vertex AI, Codex,
// Claude Code) depend on the server's provider list and are not gated here.
// Source: web/src/utils/providerPacks.ts getKeyGateForNamespace.
QString catalogKeyGate(const QString &nameSpace);
// The name a card's missing-key warning shows for a secret, such as "OpenAI API Key".
// Source: web/src/utils/nodeProvider.ts getSecretDisplayName.
QString catalogSecretDisplayName(const QString &secretKey);
// The top-level type names of a node's properties or outputs, in order and
// without repeats. A type given as a string or as {"type": ...} both count.
// Source: web/src/components/node_menu/typeFilterUtils.ts filterTypesByInputExact.
QStringList catalogTypeNames(const QJsonArray &fields);
// The quick-action tile sections of the node menu home, each {title, tiles:[{label, type}]}.
// Source: web/src/components/node_menu/QuickActionTiles.constants.tsx.
QVariantList catalogQuickActionSections();
} // namespace nodetool
