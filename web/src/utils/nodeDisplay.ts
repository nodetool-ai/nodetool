export const getNodeDisplayName = (text: string): string => {
  const parts = text.split(".");
  return parts[parts.length - 1] || text;
};

export const getNodeNamespace = (text: string): string => {
  const parts = text.split(".");
  return parts.slice(0, -1).join(".");
};
