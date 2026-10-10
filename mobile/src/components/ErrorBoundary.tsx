import { Component, type ComponentType, type ErrorInfo, type ReactElement, type ReactNode } from 'react';
import { reportError } from '../services/errorReporting';
import { ErrorState } from './ScreenState';

interface Props {
  children: ReactNode;
  /** Names the boundary in error reports, such as the screen it wraps. */
  name?: string;
  /** Offered beside "Try again", for when the same render would throw again. */
  onGoBack?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches a render error below it and shows a recoverable fallback.
 *
 * The root one keeps a crash from blanking the app. Each screen also gets its
 * own through `withScreenBoundary`, so one broken screen leaves the header and
 * back button working instead of replacing the whole navigator.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      source: 'ErrorBoundary',
      extra: { componentStack: errorInfo.componentStack, boundary: this.props.name ?? 'root' },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleReset}
          onGoBack={this.props.onGoBack}
        />
      );
    }

    return this.props.children;
  }
}

function ErrorFallback({
  error,
  onRetry,
  onGoBack,
}: {
  error: Error | null;
  onRetry: () => void;
  onGoBack?: () => void;
}) {
  return (
    <ErrorState
      title="Something went wrong"
      message="This screen hit an unexpected error. Try again, or go back and reopen it."
      details={error?.message}
      onRetry={onRetry}
      secondaryAction={onGoBack ? { label: 'Go back', onPress: onGoBack, icon: 'arrow-back' } : undefined}
    />
  );
}

interface ScreenNavigation {
  canGoBack: () => boolean;
  goBack: () => void;
}

/**
 * Wraps a stack screen in its own error boundary. The fallback offers "Go
 * back" when the stack has somewhere to go, so a screen that throws on every
 * render is never a dead end.
 */
export function withScreenBoundary<P extends { navigation: ScreenNavigation }>(
  Screen: ComponentType<P>,
  name: string
): (props: P) => ReactElement {
  // A plain function type, not `ComponentType`: the navigator accepts a
  // function screen that ignores `route`, but not a class that might.
  function BoundedScreen(props: P): ReactElement {
    const { navigation } = props;
    return (
      <ErrorBoundary
        name={name}
        onGoBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      >
        <Screen {...props} />
      </ErrorBoundary>
    );
  }
  BoundedScreen.displayName = `withScreenBoundary(${name})`;
  return BoundedScreen;
}
