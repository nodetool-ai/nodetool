import React from 'react';

interface TestComponentProps {
  text: string;
}

export const TestComponent: React.FC<TestComponentProps> = ({ text }) => {
  return <div data-testid="test-component">{text}</div>;
};