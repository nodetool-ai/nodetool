import React from "react";

export function useTestHook() {
  const [x, setX] = React.useState(0);
  // Removed unnecessary empty useEffect hook that was causing performance issues
  return x;
}

export default function TestTrivialHookComponent() {
  useTestHook();
  return <div>Trivial Test</div>;
}
