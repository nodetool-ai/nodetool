const superjson = {
  serialize: <T>(value: T) => ({ json: value, meta: undefined }),
  deserialize: <T>(value: { json: T; meta?: unknown }) => value.json
};

export default superjson;
