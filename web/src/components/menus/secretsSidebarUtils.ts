import useSecretsStore from "../../stores/SecretsStore";
import { SecretResponse } from "../../stores/ApiTypes";

/**
 * Generate sidebar sections for secrets management
 * Groups secrets by their type/category for navigation
 */
export const getSecretsSidebarSections = () => {
  const store = useSecretsStore.getState();
  const secrets = store.secrets;

  if (!secrets || secrets.length === 0) {
    return [
      {
        category: "Secrets",
        items: [{ id: "no-secrets", label: "No Secrets" }]
      }
    ];
  }

  // Group secrets by configured/unconfigured status
  const configured = secrets.filter((s: SecretResponse) => s.is_configured);
  const unconfigured = secrets.filter((s: SecretResponse) => !s.is_configured);

  const sections = [];

  if (configured.length > 0) {
    sections.push({
      category: "Configured Secrets",
      items: configured.map((secret: SecretResponse) => ({
        id: `secret-${secret.key}`,
        label: secret.key
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char: string) => char.toUpperCase())
      }))
    });
  }

  if (unconfigured.length > 0) {
    sections.push({
      category: "Available Secrets",
      items: unconfigured.map((secret: SecretResponse) => ({
        id: `secret-${secret.key}`,
        label: secret.key
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char: string) => char.toUpperCase())
      }))
    });
  }

  return sections.length > 0
    ? sections
    : [
        {
          category: "Secrets",
          items: [{ id: "no-secrets", label: "No Secrets" }]
        }
      ];
};
