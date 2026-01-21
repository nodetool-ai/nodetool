import reduceUnionType from '../reduceUnionType';
import { TypeMetadata } from '../../stores/ApiTypes';

describe('reduceUnionType', () => {
  describe('non-union types', () => {
    it('should return string type as-is', () => {
      const type = { type: 'str' } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });

    it('should return int type as-is', () => {
      const type = { type: 'int' } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('int');
    });

    it('should return float type as-is', () => {
      const type = { type: 'float' } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });

    it('should return tensor type as-is', () => {
      const type = { type: 'tensor' } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('tensor');
    });

    it('should return text type as-is', () => {
      const type = { type: 'text' } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('text');
    });
  });

  describe('union types with type_args', () => {
    it('should reduce int_float to float', () => {
      const type = { type: 'union', type_args: [{ type: 'int' }, { type: 'float' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });

    it('should reduce int_float_tensor to float', () => {
      const type = { type: 'union', type_args: [{ type: 'int' }, { type: 'float' }, { type: 'tensor' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });

    it('should reduce none_str to str', () => {
      const type = { type: 'union', type_args: [{ type: 'none' }, { type: 'str' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });

    it('should reduce none_str_text to str', () => {
      const type = { type: 'union', type_args: [{ type: 'none' }, { type: 'str' }, { type: 'text' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });

    it('should reduce none_text to str', () => {
      const type = { type: 'union', type_args: [{ type: 'none' }, { type: 'text' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });

    it('should reduce int_none to int', () => {
      const type = { type: 'union', type_args: [{ type: 'int' }, { type: 'none' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('int');
    });

    it('should reduce float_int_none to float', () => {
      const type = { type: 'union', type_args: [{ type: 'float' }, { type: 'int' }, { type: 'none' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });

    it('should reduce float_none to float', () => {
      const type = { type: 'union', type_args: [{ type: 'float' }, { type: 'none' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });

    it('should reduce str_text to str', () => {
      const type = { type: 'union', type_args: [{ type: 'str' }, { type: 'text' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });
  });

  describe('union types without matching rules', () => {
    it('should return first type (after sorting) if no rule matches', () => {
      const type = { type: 'union', type_args: [{ type: 'tensor' }, { type: 'audio' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('audio');
    });

    it('should handle union with single type arg', () => {
      const type = { type: 'union', type_args: [{ type: 'int' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('int');
    });

    it('should handle unordered type_args by sorting them', () => {
      const type = { type: 'union', type_args: [{ type: 'float' }, { type: 'int' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('float');
    });
  });

  describe('union types with undefined type_args', () => {
    it('should return str when type_args is undefined', () => {
      const type = { type: 'union', type_args: undefined } as unknown as TypeMetadata;
      expect(reduceUnionType(type)).toBe('str');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty type_args array', () => {
      const type = { type: 'union', type_args: [] } as unknown as TypeMetadata;
      expect(reduceUnionType(type)).toBeUndefined();
    });

    it('should handle unknown types', () => {
      const type = { type: 'union', type_args: [{ type: 'unknown_type' }, { type: 'another_type' }] } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('another_type');
    });

    it('should handle many type_args', () => {
      const type = { 
        type: 'union', 
        type_args: [
          { type: 'int' },
          { type: 'float' },
          { type: 'str' },
          { type: 'bool' }
        ]
      } as TypeMetadata;
      expect(reduceUnionType(type)).toBe('bool');
    });
  });
});
