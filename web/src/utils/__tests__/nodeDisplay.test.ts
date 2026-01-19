/**
 * @jest-environment node
 */
import { getNodeDisplayName, getNodeNamespace } from '../nodeDisplay';

describe('nodeDisplay', () => {
  describe('getNodeDisplayName', () => {
    it('extracts display name from simple node type', () => {
      expect(getNodeDisplayName('TextNode')).toBe('TextNode');
    });

    it('extracts last part from namespaced node type', () => {
      expect(getNodeDisplayName('audio.VoiceIsolator')).toBe('VoiceIsolator');
    });

    it('extracts from deeply nested node type', () => {
      expect(getNodeDisplayName('image.generation.StableDiffusion')).toBe('StableDiffusion');
    });

    it('handles single character parts', () => {
      expect(getNodeDisplayName('a.b')).toBe('b');
    });

    it('handles empty string', () => {
      expect(getNodeDisplayName('')).toBe('');
    });

    it('handles single part', () => {
      expect(getNodeDisplayName('SimpleNode')).toBe('SimpleNode');
    });

    it('handles node type with underscores and numbers', () => {
      expect(getNodeDisplayName('llm.LLaMA2_7B_Chat')).toBe('LLaMA2_7B_Chat');
    });

    it('handles node type with multiple dots returning last part', () => {
      expect(getNodeDisplayName('a.b.c.d')).toBe('d');
    });
  });

  describe('getNodeNamespace', () => {
    it('returns empty string for simple node type', () => {
      expect(getNodeNamespace('TextNode')).toBe('');
    });

    it('returns namespace for namespaced node type', () => {
      expect(getNodeNamespace('audio.VoiceIsolator')).toBe('audio');
    });

    it('returns full namespace for deeply nested node type', () => {
      expect(getNodeNamespace('image.generation.StableDiffusion')).toBe('image.generation');
    });

    it('handles single character parts', () => {
      expect(getNodeNamespace('a.b')).toBe('a');
    });

    it('handles empty string', () => {
      expect(getNodeNamespace('')).toBe('');
    });

    it('handles node type with two parts', () => {
      expect(getNodeNamespace('prefix.Name')).toBe('prefix');
    });

    it('handles node type with many parts', () => {
      expect(getNodeNamespace('a.b.c.d.e')).toBe('a.b.c.d');
    });
  });
});
