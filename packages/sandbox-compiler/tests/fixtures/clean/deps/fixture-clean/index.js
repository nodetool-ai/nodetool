// A pure-computation ESM utility: arithmetic and strings, nothing else.
export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export default { slugify, sum };
