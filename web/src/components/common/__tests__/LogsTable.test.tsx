import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LogsTable, { LogRow } from '../LogsTable';
import { ThemeProvider } from '@mui/material/styles';
import mockTheme from '../../../__mocks__/themeMock';

// Mock UI primitives
jest.mock('../../ui_primitives', () => {
  const CopyButton = (props: any) => <button {...props}>Copy</button>;
  CopyButton.displayName = "CopyButton";
  const Text = ({ children, ...props }: any) => <span {...props}>{children}</span>;
  Text.displayName = "Text";
  const Tooltip = ({ children }: any) => <>{children}</>;
  Tooltip.displayName = "Tooltip";
  const ToolbarIconButton = ({ children, ...props }: any) => <button {...props}>{children}</button>;
  ToolbarIconButton.displayName = "ToolbarIconButton";
  const Card = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  Card.displayName = "Card";
  const Popover = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  Popover.displayName = "Popover";
  const FlexColumn = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  FlexColumn.displayName = "FlexColumn";
  const FlexRow = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  FlexRow.displayName = "FlexRow";
  return {
    __esModule: true,
    CopyButton,
    Text,
    Tooltip,
    ToolbarIconButton,
    Card,
    Popover,
    FlexColumn,
    FlexRow
  };
});

// Mock MUI Tooltip
jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material');
  const TooltipMock = ({ children }: any) => <div data-testid="tooltip">{children}</div>;
  TooltipMock.displayName = "TooltipMock";
  return {
    ...actual,
    Tooltip: TooltipMock
  };
});

// Mock Icons - define inline to avoid hoisting issues
jest.mock("@mui/icons-material/KeyboardArrowDown", () => {
  const KeyboardArrowDownIcon = () => <span data-testid="arrow-down-icon" />;
  KeyboardArrowDownIcon.displayName = "KeyboardArrowDownIcon";
  return KeyboardArrowDownIcon;
});

jest.mock("@mui/icons-material/DataObject", () => {
  const DataObjectIcon = () => <span data-testid="data-object-icon" />;
  DataObjectIcon.displayName = "DataObjectIcon";
  return DataObjectIcon;
});

// jsdom has no ResizeObserver — provide a no-op shim before the component
// imports anything that might capture a reference.
class ResizeObserverShim {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = ResizeObserverShim;

// Bypass virtualization in tests: render every row synchronously.
// jsdom has no layout engine, so @tanstack/react-virtual's measurements
// would return zero and no items would appear.
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 36,
        end: (index + 1) * 36,
        size: 36,
        lane: 0,
      })),
    getTotalSize: () => count * 36,
    measure: () => {},
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));

const defaultProps = {
  rows: [],
  rowHeight: 36,
  height: 600,
  showTimestampColumn: true,
};

const renderWithTheme = (component: React.ReactNode) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {component}
    </ThemeProvider>
  );
};

describe('LogsTable', () => {
  const mockRows: LogRow[] = [
    { severity: 'info', timestamp: 1677657600000, content: 'Log 1' },
    { severity: 'error', timestamp: 1677657601000, content: 'Log 2 Error' },
    { severity: 'warning', timestamp: 1677657602000, content: 'Log 3 Warning' },
  ];

  it('renders empty state correctly', () => {
    renderWithTheme(<LogsTable {...defaultProps} />);
    expect(screen.getByText('No logs to display')).toBeInTheDocument();
  });

  it('renders rows correctly', () => {
    renderWithTheme(<LogsTable {...defaultProps} rows={mockRows} />);
    expect(screen.getByText('Log 1')).toBeInTheDocument();
    expect(screen.getByText('Log 2 Error')).toBeInTheDocument();
    expect(screen.getByText('Log 3 Warning')).toBeInTheDocument();
  });

  it('filters rows by severity', () => {
    renderWithTheme(<LogsTable {...defaultProps} rows={mockRows} severities={['error']} />);
    expect(screen.queryByText('Log 1')).not.toBeInTheDocument();
    expect(screen.getByText('Log 2 Error')).toBeInTheDocument();
    expect(screen.queryByText('Log 3 Warning')).not.toBeInTheDocument();
  });

  it('toggles expansion on row click', () => {
    renderWithTheme(<LogsTable {...defaultProps} rows={mockRows} />);
    const row1Content = screen.getByText('Log 1');
    const row1Container = row1Content.closest('.row');

    expect(row1Container).not.toHaveClass('expanded');

    // Click to expand
    fireEvent.click(row1Content);

    const row1ContentAfter = screen.getByText('Log 1');
    const row1ContainerAfter = row1ContentAfter.closest('.row');
    expect(row1ContainerAfter).toHaveClass('expanded');
  });
});
