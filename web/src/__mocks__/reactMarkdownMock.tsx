import React from "react";

export default function MockMarkdown({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export const remarkGfm = () => null;
export const rehypeRaw = () => null;
