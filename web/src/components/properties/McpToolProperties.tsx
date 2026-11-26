import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import isEqual from "../../utils/isEqual";
import type { PropertyProps } from "../node/PropertyInput";
import PropertyLabel from "../node/PropertyLabel";
import Select from "../inputs/Select";
import { useNodes } from "../../contexts/NodeContext";
import { useExternalMcpCatalog } from "../../serverState/useExternalMcpCatalog";
import { LoadingSpinner } from "../ui_primitives";

/** Pickers of the Call MCP Tool node: one of the user's servers, then a tool on it. */
export const McpServerProperty: React.FC<PropertyProps<string>> = memo(
  ({ property, propertyIndex, nodeId, value, tabIndex, changed }) => {
    const { t } = useTranslation();
    const id = `mcp-server-${property.name}-${propertyIndex}`;
    const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
    const { data, error, isLoading } = useExternalMcpCatalog();
    const options = useMemo(
      () => (data?.servers ?? []).map((s) => ({ label: s.name, value: s.id })),
      [data]
    );
    return (
      <div className="mcp-server-property">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        {isLoading && <LoadingSpinner size="small" />}
        {error && (
          <p>{t("i18n-next40.property.error", { error: error.message })}</p>
        )}
        <Select
          value={value || ""}
          // A tool belongs to one server, so a new server clears the tool.
          onChange={(server) =>
            updateNodeProperties(nodeId, {
              [property.name]: server,
              tool: "",
              input_schema: {}
            })
          }
          options={options}
          label={property.name}
          placeholder={t("i18n-next40.collection.select")}
          tabIndex={tabIndex}
          changed={changed}
        />
      </div>
    );
  },
  isEqual
);
McpServerProperty.displayName = "McpServerProperty";

export const McpToolProperty: React.FC<PropertyProps<string>> = memo(
  ({ property, propertyIndex, nodeId, value, tabIndex, changed }) => {
    const { t } = useTranslation();
    const id = `mcp-tool-${property.name}-${propertyIndex}`;
    const server = useNodes(
      (state) => state.findNode(nodeId)?.data?.properties?.server
    );
    const updateNodeProperties = useNodes((state) => state.updateNodeProperties);
    const { data, error, isLoading } = useExternalMcpCatalog();
    const tools = useMemo(
      () => data?.servers.find((s) => s.id === server)?.tools ?? [],
      [data, server]
    );
    const options = useMemo(
      () => tools.map((tool) => ({ label: tool.name, value: tool.name })),
      [tools]
    );
    // Picking a tool also stores its schema, which is where the node's input
    // handles come from, so the two properties change together.
    const pick = (name: string): void => {
      const tool = tools.find((candidate) => candidate.name === name);
      updateNodeProperties(nodeId, {
        [property.name]: name,
        input_schema: tool?.input_schema ?? {}
      });
    };
    return (
      <div className="mcp-tool-property">
        <PropertyLabel
          name={property.name}
          description={property.description}
          id={id}
        />
        {isLoading && <LoadingSpinner size="small" />}
        {error && (
          <p>{t("i18n-next40.property.error", { error: error.message })}</p>
        )}
        <Select
          value={value || ""}
          onChange={pick}
          options={options}
          label={property.name}
          placeholder={t("i18n-next40.collection.select")}
          tabIndex={tabIndex}
          changed={changed}
        />
      </div>
    );
  },
  isEqual
);
McpToolProperty.displayName = "McpToolProperty";
