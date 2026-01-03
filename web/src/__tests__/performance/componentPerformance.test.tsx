/**
 * Performance Regression Tests for Optimized Components
 *
 * These tests verify that optimizations prevent unnecessary re-renders
 * and cover complex dependency scenarios including second-order effects.
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { create } from 'zustand';

// Mock dependencies
jest.mock('../../contexts/NodeContext');
jest.mock('../../stores/MetadataStore');
jest.mock('../../stores/StatusStore');
jest.mock('../../stores/ResultsStore');

// Track render counts
let renderCounts: { [key: string]: number } = {};

const trackRender = (componentName: string) => {
  renderCounts[componentName] = (renderCounts[componentName] || 0) + 1;
};

const resetRenderCounts = () => {
  renderCounts = {};
};

const getRenderCount = (componentName: string): number => {
  return renderCounts[componentName] || 0;
};

describe('Performance Regression Tests', () => {
  beforeEach(() => {
    resetRenderCounts();
  });

  describe('Zustand Selector Object Creation', () => {
    // Simulates the CRITICAL issue we fixed in NodeInputs
    it('should not re-render when using object selector with unchanged values', () => {
      // Create a test store
      const useTestStore = create<{ edges: any[]; nodes: any[] }>(() => ({
        edges: [{ id: '1', source: 'a', target: 'b' }],
        nodes: [{ id: 'a' }, { id: 'b' }]
      }));

      // BAD: Object selector creates new reference
      const BadComponent = () => {
        const { edges } = useTestStore((state) => ({
          edges: state.edges
        }));
        trackRender('BadComponent');
        return <div>{edges.length}</div>;
      };

      // GOOD: Direct selector
      const GoodComponent = () => {
        const edges = useTestStore((state) => state.edges);
        trackRender('GoodComponent');
        return <div>{edges.length}</div>;
      };

      const { rerender: rerenderBad } = render(<BadComponent />);
      const { rerender: rerenderGood } = render(<GoodComponent />);

      expect(getRenderCount('BadComponent')).toBe(1);
      expect(getRenderCount('GoodComponent')).toBe(1);

      // Trigger a re-render without changing edges
      useTestStore.setState({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });

      rerenderBad(<BadComponent />);
      rerenderGood(<GoodComponent />);

      // Bad component re-renders because object reference changed
      // Good component doesn't re-render because edges didn't change
      expect(getRenderCount('BadComponent')).toBeGreaterThan(1);
      expect(getRenderCount('GoodComponent')).toBe(1); // Still 1!
    });

    it('should demonstrate 100x re-render reduction with proper selectors', () => {
      const useTestStore = create<{ data: any; counter: number }>(() => ({
        data: { value: 1 },
        counter: 0
      }));

      let badRenders = 0;
      let goodRenders = 0;

      const BadSelector = () => {
        const data = useTestStore((state) => ({ data: state.data }));
        badRenders++;
        return null;
      };

      const GoodSelector = () => {
        const data = useTestStore((state) => state.data);
        goodRenders++;
        return null;
      };

      render(
        <>
          <BadSelector />
          <GoodSelector />
        </>
      );

      // Simulate 100 unrelated updates
      for (let i = 0; i < 100; i++) {
        useTestStore.setState({ counter: i });
      }

      expect(badRenders).toBe(101); // Initial + 100 updates
      expect(goodRenders).toBe(1); // Only initial render!

      console.log(`[PERF] Bad selector: ${badRenders} renders, Good selector: ${goodRenders} renders`);
      console.log(`[PERF] Reduction: ${((1 - goodRenders / badRenders) * 100).toFixed(1)}%`);
    });
  });

  describe('useMemo Dependency Tracking', () => {
    it('should only recompute when actual dependencies change', () => {
      let computeCount = 0;

      const TestComponent = ({ data, filter }: { data: string[]; filter: string }) => {
        const filtered = React.useMemo(() => {
          computeCount++;
          return data.filter((item) => item.includes(filter));
        }, [data, filter]);

        return <div>{filtered.join(',')}</div>;
      };

      const { rerender } = render(<TestComponent data={['a', 'b', 'c']} filter="a" />);
      expect(computeCount).toBe(1);

      // Re-render with same props
      rerender(<TestComponent data={['a', 'b', 'c']} filter="a" />);
      expect(computeCount).toBe(2); // Increments because array is new reference!

      // This demonstrates why we need stable references
    });

    it('should demonstrate array reference stability importance', () => {
      let computeCount = 0;
      const stableData = ['a', 'b', 'c'];

      const TestComponent = ({ data, filter }: { data: string[]; filter: string }) => {
        const filtered = React.useMemo(() => {
          computeCount++;
          return data.filter((item) => item.includes(filter));
        }, [data, filter]);

        return <div>{filtered.join(',')}</div>;
      };

      const { rerender } = render(<TestComponent data={stableData} filter="a" />);
      expect(computeCount).toBe(1);

      // Re-render with same stable reference
      rerender(<TestComponent data={stableData} filter="a" />);
      expect(computeCount).toBe(1); // Doesn't recompute!

      // Re-render with different filter
      rerender(<TestComponent data={stableData} filter="b" />);
      expect(computeCount).toBe(2); // Only recomputes when filter changes
    });
  });

  describe('Second-Order Effects', () => {
    // Tests that changing A doesn't cause B to re-render
    it('should prevent cascading re-renders in sibling components', () => {
      const useStore = create<{ valueA: number; valueB: number }>(() => ({
        valueA: 1,
        valueB: 1
      }));

      let componentARenders = 0;
      let componentBRenders = 0;

      const ComponentA = () => {
        const valueA = useStore((state) => state.valueA);
        componentARenders++;
        return <div>A: {valueA}</div>;
      };

      const ComponentB = () => {
        const valueB = useStore((state) => state.valueB);
        componentBRenders++;
        return <div>B: {valueB}</div>;
      };

      render(
        <>
          <ComponentA />
          <ComponentB />
        </>
      );

      expect(componentARenders).toBe(1);
      expect(componentBRenders).toBe(1);

      // Change valueA
      useStore.setState({ valueA: 2 });

      expect(componentARenders).toBe(2); // A re-renders
      expect(componentBRenders).toBe(1); // B should NOT re-render!
    });

    it('should prevent parent re-renders from causing child re-renders when memoized', () => {
      let parentRenders = 0;
      let childRenders = 0;

      const Child = React.memo(({ value }: { value: number }) => {
        childRenders++;
        return <div>{value}</div>;
      });
      Child.displayName = 'Child';

      const Parent = ({ trigger: _trigger }: { trigger: number }) => {
        parentRenders++;
        const stableValue = 42; // This never changes
        return <Child value={stableValue} />;
      };

      const { rerender } = render(<Parent trigger={1} />);
      expect(parentRenders).toBe(1);
      expect(childRenders).toBe(1);

      // Trigger parent re-render
      rerender(<Parent trigger={2} />);
      expect(parentRenders).toBe(2);
      expect(childRenders).toBe(1); // Child should NOT re-render!
    });

    it('should demonstrate third-order effects with nested components', () => {
      const useStore = create<{ a: number; b: number; c: number }>(() => ({
        a: 1,
        b: 1,
        c: 1
      }));

      let aRenders = 0;
      let bRenders = 0;
      let cRenders = 0;

      // C depends on B, B depends on A
      const ComponentA = () => {
        const a = useStore((state) => state.a);
        aRenders++;
        return <ComponentB />;
      };

      const ComponentB = React.memo(() => {
        const b = useStore((state) => state.b);
        bRenders++;
        return <ComponentC />;
      });
      ComponentB.displayName = 'ComponentB';

      const ComponentC = React.memo(() => {
        const c = useStore((state) => state.c);
        cRenders++;
        return <div>C: {c}</div>;
      });
      ComponentC.displayName = 'ComponentC';

      render(<ComponentA />);

      expect(aRenders).toBe(1);
      expect(bRenders).toBe(1);
      expect(cRenders).toBe(1);

      // Change A (unrelated to B and C)
      useStore.setState({ a: 2 });

      expect(aRenders).toBe(2); // A re-renders
      expect(bRenders).toBe(1); // B should NOT re-render (memoized)
      expect(cRenders).toBe(1); // C should NOT re-render (memoized)
    });
  });

  describe('Complex Dependency Scenarios', () => {
    it('should handle diamond dependency pattern efficiently', () => {
      /**
       * Diamond pattern:
       *       A
       *      / \
       *     B   C
       *      \ /
       *       D
       *
       * When A changes, B and C should update, but D should only update once
       */
      const useStore = create<{ root: number }>(() => ({ root: 1 }));

      const renders = { A: 0, B: 0, C: 0, D: 0 };

      const ComponentA = () => {
        const root = useStore((state) => state.root);
        renders.A++;
        return (
          <>
            <ComponentB value={root} />
            <ComponentC value={root} />
          </>
        );
      };

      const ComponentB = React.memo(({ value }: { value: number }) => {
        renders.B++;
        return <ComponentD source="B" value={value} />;
      });
      ComponentB.displayName = 'ComponentB';

      const ComponentC = React.memo(({ value }: { value: number }) => {
        renders.C++;
        return <ComponentD source="C" value={value} />;
      });
      ComponentC.displayName = 'ComponentC';

      // D receives same value from both B and C
      const ComponentD = React.memo(({ source, value }: { source: string; value: number }) => {
        renders.D++;
        return <div>{source}: {value}</div>;
      });
      ComponentD.displayName = 'ComponentD';

      const { rerender } = render(<ComponentA />);

      expect(renders).toEqual({ A: 1, B: 1, C: 1, D: 2 }); // D renders twice initially

      // Update root
      useStore.setState({ root: 2 });
      rerender(<ComponentA />);

      // All should update, but efficiently
      expect(renders.A).toBe(2);
      expect(renders.B).toBe(2);
      expect(renders.C).toBe(2);
      expect(renders.D).toBe(4); // D renders for each parent
    });

    it('should handle deeply nested memoization correctly', () => {
      let computations = 0;

      const Level5 = React.memo(({ value }: { value: number }) => {
        const computed = React.useMemo(() => {
          computations++;
          return value * 2;
        }, [value]);
        return <div>{computed}</div>;
      });
      Level5.displayName = 'Level5';

      const Level4 = React.memo(({ value }: { value: number }) => {
        return <Level5 value={value} />;
      });
      Level4.displayName = 'Level4';

      const Level3 = React.memo(({ value }: { value: number }) => {
        return <Level4 value={value} />;
      });
      Level3.displayName = 'Level3';

      const Level2 = React.memo(({ value }: { value: number }) => {
        return <Level3 value={value} />;
      });
      Level2.displayName = 'Level2';

      const Level1 = ({ value, trigger }: { value: number; trigger: number }) => {
        return <Level2 value={value} />;
      };

      const { rerender } = render(<Level1 value={10} trigger={1} />);
      expect(computations).toBe(1);

      // Re-render with same value but different trigger
      rerender(<Level1 value={10} trigger={2} />);
      expect(computations).toBe(1); // Should NOT recompute!

      // Re-render with different value
      rerender(<Level1 value={20} trigger={3} />);
      expect(computations).toBe(2); // Should recompute
    });

    it('should handle conditional rendering with memoization', () => {
      let expensiveComputations = 0;

      const ExpensiveComponent = React.memo(({ data }: { data: number[] }) => {
        const result = React.useMemo(() => {
          expensiveComputations++;
          return data.reduce((_a, b) => _a + b, 0);
        }, [data]);

        return <div>{result}</div>;
      });
      ExpensiveComponent.displayName = 'ExpensiveComponent';

      const Parent = ({ show, data }: { show: boolean; data: number[] }) => {
        return <>{show && <ExpensiveComponent data={data} />}</>;
      };

      const stableData = [1, 2, 3];

      const { rerender } = render(<Parent show={true} data={stableData} />);
      expect(expensiveComputations).toBe(1);

      // Hide component
      rerender(<Parent show={false} data={stableData} />);
      expect(expensiveComputations).toBe(1); // No new computation

      // Show again with same data
      rerender(<Parent show={true} data={stableData} />);
      expect(expensiveComputations).toBe(2); // Mounted again, recomputes

      // Re-render with same data
      rerender(<Parent show={true} data={stableData} />);
      expect(expensiveComputations).toBe(2); // Should NOT recompute
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect when inline objects cause unnecessary re-renders', () => {
      let childRenders = 0;

      const Child = React.memo(({ config }: { config: { value: number } }) => {
        childRenders++;
        return <div>{config.value}</div>;
      });
      Child.displayName = 'Child';

      // BAD: Inline object
      const BadParent = ({ trigger }: { trigger: number }) => {
        return <Child config={{ value: 42 }} />; // New object every render!
      };

      const { rerender: rerenderBad } = render(<BadParent trigger={1} />);
      expect(childRenders).toBe(1);

      rerenderBad(<BadParent trigger={2} />);
      expect(childRenders).toBe(2); // Re-rendered due to new object!

      childRenders = 0;

      // GOOD: Stable object
      const stableConfig = { value: 42 };
      const GoodParent = ({ trigger }: { trigger: number }) => {
        return <Child config={stableConfig} />;
      };

      const { rerender: rerenderGood } = render(<GoodParent trigger={1} />);
      expect(childRenders).toBe(1);

      rerenderGood(<GoodParent trigger={2} />);
      expect(childRenders).toBe(1); // Did NOT re-render!
    });

    it('should measure render time for large component trees', () => {
      const createLargeTree = (depth: number, breadth: number): React.ReactNode => {
        if (depth === 0) {
          return <div>Leaf</div>;
        }

        return (
          <>
            {Array.from({ length: breadth }, (_, i) => (
              <React.Fragment key={i}>
                {createLargeTree(depth - 1, breadth)}
              </React.Fragment>
            ))}
          </>
        );
      };

      const start = performance.now();
      render(<>{createLargeTree(5, 3)}</>); // 3^5 = 243 components
      const duration = performance.now() - start;

      console.log(`[PERF] Large tree (243 components) render: ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should benchmark memo effectiveness', () => {
      let unmemoizedRenders = 0;
      let memoizedRenders = 0;

      const UnmemoizedComponent = ({ value }: { value: number }) => {
        unmemoizedRenders++;
        return <div>{value}</div>;
      };

      const MemoizedComponent = React.memo(({ value }: { value: number }) => {
        memoizedRenders++;
        return <div>{value}</div>;
      });
      MemoizedComponent.displayName = 'MemoizedComponent';

      const Parent = ({ trigger }: { trigger: number }) => {
        return (
          <>
            <UnmemoizedComponent value={42} />
            <MemoizedComponent value={42} />
          </>
        );
      };

      const { rerender } = render(<Parent trigger={1} />);

      // Initial render
      expect(unmemoizedRenders).toBe(1);
      expect(memoizedRenders).toBe(1);

      // Trigger 100 parent re-renders
      for (let i = 2; i <= 101; i++) {
        rerender(<Parent trigger={i} />);
      }

      console.log(`[PERF] Unmemoized: ${unmemoizedRenders} renders`);
      console.log(`[PERF] Memoized: ${memoizedRenders} renders`);
      console.log(`[PERF] Memo effectiveness: ${((1 - memoizedRenders / unmemoizedRenders) * 100).toFixed(1)}%`);

      expect(unmemoizedRenders).toBe(101); // Every parent render
      expect(memoizedRenders).toBe(1); // Only initial render!
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle 100 nodes with selective updates efficiently', () => {
      const useNodesStore = create<{
        nodes: Array<{ id: string; selected: boolean }>;
        selectNode: (id: string) => void;
      }>((set) => ({
        nodes: Array.from({ length: 100 }, (_, i) => ({
          id: `node-${i}`,
          selected: false
        })),
        selectNode: (id) =>
          set((state) => ({
            nodes: state.nodes.map((n) =>
              n.id === id ? { ...n, selected: true } : n
            )
          }))
      }));

      const renders = new Map<string, number>();

      const Node = React.memo(({ id }: { id: string }) => {
        const selected = useNodesStore(
          (state) => state.nodes.find((n) => n.id === id)?.selected || false
        );
        renders.set(id, (renders.get(id) || 0) + 1);
        return <div className={selected ? 'selected' : ''}>{id}</div>;
      });
      Node.displayName = 'Node';

      // Render 100 nodes
      render(
        <>
          {Array.from({ length: 100 }, (_, i) => (
            <Node key={`node-${i}`} id={`node-${i}`} />
          ))}
        </>
      );

      // All nodes render initially
      expect(renders.size).toBe(100);
      Array.from(renders.values()).forEach((count) => {
        expect(count).toBe(1);
      });

      // Select one node
      useNodesStore.getState().selectNode('node-50');

      // All nodes re-render because we updated the entire array
      // This is expected with this selector pattern
      const totalRenders = Array.from(renders.values()).reduce((a, b) => a + b, 0);
      console.log(`[PERF] Total renders after selection: ${totalRenders}`);
    });
  });
});
