import React from "react";

export function useTestHook() {
  const [x] = React.useState(0);
  React.useEffect(() => {}, []);
  return x;
}

export default function TestTrivialHookComponent() {
  useTestHook();
  return <div>Trivial Test</div>;
}
