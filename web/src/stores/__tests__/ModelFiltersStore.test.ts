import useModelFiltersStore, { TypeTag, SizeBucket } from '../ModelFiltersStore';

describe('ModelFiltersStore', () => {
  const initialState = useModelFiltersStore.getState();

  beforeEach(() => {
    useModelFiltersStore.setState(initialState, true);
  });

  describe('initial state', () => {
    it('has empty selected types', () => {
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
    });

    it('has null size bucket', () => {
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
    });

    it('has empty families', () => {
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });
  });

  describe('toggleType', () => {
    it('adds type when not present', () => {
      useModelFiltersStore.getState().toggleType('chat' as TypeTag);
      expect(useModelFiltersStore.getState().selectedTypes).toContain('chat');
    });

    it('removes type when present', () => {
      useModelFiltersStore.setState({ selectedTypes: ['chat' as TypeTag, 'code' as TypeTag] });
      useModelFiltersStore.getState().toggleType('chat' as TypeTag);
      expect(useModelFiltersStore.getState().selectedTypes).toEqual(['code' as TypeTag]);
    });

    it('can toggle multiple types', () => {
      useModelFiltersStore.getState().toggleType('chat' as TypeTag);
      useModelFiltersStore.getState().toggleType('instruct' as TypeTag);
      useModelFiltersStore.getState().toggleType('code' as TypeTag);
      expect(useModelFiltersStore.getState().selectedTypes).toEqual(['chat', 'instruct', 'code']);
    });
  });

  describe('setSizeBucket', () => {
    it('sets size bucket to value', () => {
      useModelFiltersStore.getState().setSizeBucket('3-7B' as SizeBucket);
      expect(useModelFiltersStore.getState().sizeBucket).toBe('3-7B');
    });

    it('sets size bucket to null', () => {
      useModelFiltersStore.setState({ sizeBucket: '8-15B' as SizeBucket });
      useModelFiltersStore.getState().setSizeBucket(null);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
    });

    it('replaces existing size bucket', () => {
      useModelFiltersStore.setState({ sizeBucket: '3-7B' as SizeBucket });
      useModelFiltersStore.getState().setSizeBucket('16-34B' as SizeBucket);
      expect(useModelFiltersStore.getState().sizeBucket).toBe('16-34B');
    });
  });

  describe('toggleFamily', () => {
    it('adds family when not present', () => {
      useModelFiltersStore.getState().toggleFamily('llama');
      expect(useModelFiltersStore.getState().families).toContain('llama');
    });

    it('removes family when present', () => {
      useModelFiltersStore.setState({ families: ['llama', 'mistral'] });
      useModelFiltersStore.getState().toggleFamily('llama');
      expect(useModelFiltersStore.getState().families).toEqual(['mistral']);
    });

    it('can toggle multiple families', () => {
      useModelFiltersStore.getState().toggleFamily('llama');
      useModelFiltersStore.getState().toggleFamily('qwen');
      useModelFiltersStore.getState().toggleFamily('mistral');
      expect(useModelFiltersStore.getState().families).toEqual(['llama', 'qwen', 'mistral']);
    });
  });

  describe('clearAll', () => {
    it('clears all filters', () => {
      useModelFiltersStore.setState({
        selectedTypes: ['chat' as TypeTag, 'code' as TypeTag],
        sizeBucket: '8-15B' as SizeBucket,
        families: ['llama', 'mistral']
      });

      useModelFiltersStore.getState().clearAll();

      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });

    it('works on initial state', () => {
      useModelFiltersStore.getState().clearAll();
      expect(useModelFiltersStore.getState().selectedTypes).toEqual([]);
      expect(useModelFiltersStore.getState().sizeBucket).toBeNull();
      expect(useModelFiltersStore.getState().families).toEqual([]);
    });
  });

  describe('combined operations', () => {
    it('maintains state correctly through multiple operations', () => {
      useModelFiltersStore.getState().toggleType('chat' as TypeTag);
      useModelFiltersStore.getState().toggleType('code' as TypeTag);
      useModelFiltersStore.getState().setSizeBucket('3-7B' as SizeBucket);
      useModelFiltersStore.getState().toggleFamily('llama');

      expect(useModelFiltersStore.getState().selectedTypes).toEqual(['chat', 'code']);
      expect(useModelFiltersStore.getState().sizeBucket).toBe('3-7B');
      expect(useModelFiltersStore.getState().families).toEqual(['llama']);

      useModelFiltersStore.getState().clearAll();
      expect(useModelFiltersStore.getState()).toEqual(initialState);
    });
  });
});
