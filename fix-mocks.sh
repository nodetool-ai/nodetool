for file in $(find web/src/components/node_types/editing -name "*.test.tsx" -o -name "*.test.ts"); do
  sed -i 's/useNodes: jest.fn()/useNodes: jest.fn().mockReturnValue({ upstreamEdge: undefined, findNode: jest.fn() })/g' "$file"
done
