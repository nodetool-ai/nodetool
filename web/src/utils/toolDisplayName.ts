/**
 * A tool's wire name as a person reads it: `generate_image` becomes
 * "Generate image", and a narrowed rule key `run_apify_actor:apify/web`
 * becomes "Run apify actor: apify/web".
 */
export function toolDisplayName(name: string): string {
  const colon = name.indexOf(":");
  const tool = colon >= 0 ? name.slice(0, colon) : name;
  const target = colon >= 0 ? name.slice(colon + 1) : "";
  const words = tool.replace(/_/g, " ").trim();
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return target ? `${label}: ${target}` : label;
}
