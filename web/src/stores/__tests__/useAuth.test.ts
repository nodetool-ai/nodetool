import { useAuth } from '../useAuth';

describe('useAuth', () => {
  const initialState = useAuth.getState();

  afterEach(() => {
    useAuth.setState(initialState, true);
  });

  describe('Initial State', () => {
    test('has correct default state', () => {
      const state = useAuth.getState();
      expect(state.session).toBeNull();
      expect(state.user).toBeNull();
      expect(state.state).toBe('init');
      expect(state.error).toBeNull();
      expect(state._authSubscription).toBeNull();
    });
  });

  describe('State Transitions', () => {
    test('can transition to loading state', () => {
      useAuth.setState({ state: 'loading' });
      expect(useAuth.getState().state).toBe('loading');
    });

    test('can transition to logged_in state with user', () => {
      const mockUser = { id: 'user-123' };
      useAuth.setState({
        state: 'logged_in',
        user: mockUser as any,
        session: { access_token: 'token' } as any
      });
      expect(useAuth.getState().state).toBe('logged_in');
      expect(useAuth.getState().user).toEqual(mockUser);
    });

    test('can transition to logged_out state', () => {
      useAuth.setState({
        state: 'logged_out',
        user: null,
        session: null
      });
      expect(useAuth.getState().state).toBe('logged_out');
      expect(useAuth.getState().user).toBeNull();
      expect(useAuth.getState().session).toBeNull();
    });

    test('can transition to error state with message', () => {
      useAuth.setState({
        state: 'error',
        error: 'Authentication failed'
      });
      expect(useAuth.getState().state).toBe('error');
      expect(useAuth.getState().error).toBe('Authentication failed');
    });
  });

  describe('Subscription Management', () => {
    test('can set and clear subscription', () => {
      const mockSubscription = { unsubscribe: jest.fn() };
      useAuth.setState({ _authSubscription: mockSubscription as any });
      expect(useAuth.getState()._authSubscription).toEqual(mockSubscription);

      useAuth.getState().cleanup();
      expect(useAuth.getState()._authSubscription).toBeNull();
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    test('cleanup does nothing when no subscription', () => {
      useAuth.setState({ _authSubscription: null });
      expect(() => useAuth.getState().cleanup()).not.toThrow();
    });
  });

  describe('Actions', () => {
    test('cleanup action exists and is callable', () => {
      expect(typeof useAuth.getState().cleanup).toBe('function');
    });

    test('initialize action exists and is async', () => {
      expect(typeof useAuth.getState().initialize).toBe('function');
      const result = useAuth.getState().initialize();
      expect(result).toBeInstanceOf(Promise);
    });

    test('signInWithProvider action exists and is async', () => {
      expect(typeof useAuth.getState().signInWithProvider).toBe('function');
      const result = useAuth.getState().signInWithProvider('google');
      expect(result).toBeInstanceOf(Promise);
    });

    test('signOut action exists and is async', () => {
      expect(typeof useAuth.getState().signOut).toBe('function');
      const result = useAuth.getState().signOut();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('Store Interface', () => {
    test('store has all required methods', () => {
      const state = useAuth.getState();
      expect(typeof state.cleanup).toBe('function');
      expect(typeof state.initialize).toBe('function');
      expect(typeof state.signInWithProvider).toBe('function');
      expect(typeof state.signOut).toBe('function');
    });

    test('store has all required properties', () => {
      const state = useAuth.getState();
      expect('session' in state).toBe(true);
      expect('user' in state).toBe(true);
      expect('state' in state).toBe(true);
      expect('error' in state).toBe(true);
      expect('_authSubscription' in state).toBe(true);
    });

    test('state is a discriminated union', () => {
      expect(useAuth.getState().state).toMatch(/^(init|loading|error|logged_in|logged_out)$/);
    });
  });
});
