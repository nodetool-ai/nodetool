const superjson = {
  serialize: <T>(value: T) => ({ json: value, meta: undefined }),
  deserialize: <T>(value: T) => value
};

export default superjson;
