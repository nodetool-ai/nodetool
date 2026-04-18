module.exports = {
  serialize(value) {
    return { json: value, meta: undefined };
  },
  deserialize(value) {
    return value;
  },
};
