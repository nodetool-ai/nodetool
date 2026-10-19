import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    returnNull: false;
    // Deriving every nested key from the full catalog makes TypeScript expand
    // an 18k-key union at each t() call. Catalog parity is checked separately.
    resources: object;
  }
}
