import { getInputKind } from './inputUtils';

describe('inputUtils', () => {
  describe('getInputKind', () => {
    it('returns "string" for nodetool.input.TextInput', () => {
      expect(getInputKind('nodetool.input.TextInput')).toBe('string');
    });

    it('returns "integer" for nodetool.input.IntegerInput', () => {
      expect(getInputKind('nodetool.input.IntegerInput')).toBe('integer');
    });

    it('returns "float" for nodetool.input.FloatInput', () => {
      expect(getInputKind('nodetool.input.FloatInput')).toBe('float');
    });

    it('returns "boolean" for nodetool.input.BooleanInput', () => {
      expect(getInputKind('nodetool.input.BooleanInput')).toBe('boolean');
    });

    it('returns "integer" for node types containing "Integer"', () => {
      expect(getInputKind('custom.IntegerValue')).toBe('integer');
      expect(getInputKind('some.node.Integer')).toBe('integer');
    });

    it('returns "float" for node types containing "Float"', () => {
      expect(getInputKind('custom.FloatValue')).toBe('float');
      expect(getInputKind('some.node.Float')).toBe('float');
    });

    it('returns "boolean" for node types containing "Boolean"', () => {
      expect(getInputKind('custom.BooleanValue')).toBe('boolean');
      expect(getInputKind('some.node.Boolean')).toBe('boolean');
    });

    it('returns "string" for node types containing "Input"', () => {
      expect(getInputKind('custom.SomeInput')).toBe('string');
      expect(getInputKind('nodetool.input.CustomInput')).toBe('string');
    });

    it('returns null for unknown node types', () => {
      expect(getInputKind('unknown.node.Type')).toBeNull();
      expect(getInputKind('some.random.node')).toBeNull();
    });

    it('handles empty string', () => {
      expect(getInputKind('')).toBeNull();
    });

    it('prioritizes exact matches over partial matches', () => {
      // TextInput should match exactly before fallback to "Input"
      expect(getInputKind('nodetool.input.TextInput')).toBe('string');
      // IntegerInput should match exactly
      expect(getInputKind('nodetool.input.IntegerInput')).toBe('integer');
    });
  });
});
