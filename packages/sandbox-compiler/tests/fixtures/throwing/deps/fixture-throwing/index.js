// Bundling and the scan both pass; initialization is where this fails.
const configured = null;
if (configured === null) {
  throw new Error("fixture-throwing refuses to initialize without configuration");
}

export const value = configured;
