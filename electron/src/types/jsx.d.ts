/// <reference types="react" />
/// <reference types="react-dom" />

declare namespace JSX {
  type IntrinsicElements = React.JSX.IntrinsicElements;
  type Element = React.JSX.Element;
  type ElementClass = React.JSX.ElementClass;
  type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
  type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
  type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
}