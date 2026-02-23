import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LogsTable, { LogRow } from '../LogsTable';
import { ThemeProvider } from '@mui/material/styles';

// Mock the theme
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('../../themes/ThemeNodetool', () => require('../../../__mocks__/themeMock'));
import ThemeNodetool from '../../themes/ThemeNodetool';

// Mock UI primitives
jest.mock('../../ui_primitives', () => {
  const CopyButton = (props: any) => <button {...props}>Copy</button>;
  CopyButton.displayName = "CopyButton";
  return {
    __esModule: true,
    CopyButton
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

// Mock AutoSizer correctly for default export
jest.mock("react-virtualized-auto-sizer", () => ({
  __esModule: true,
  default: ({ children }: any) => children({ height: 600, width: 800 })
}));

// Mock react-window to isolate issues
jest.mock('react-window', () => {
  const VariableSizeList = ({ children: Row, itemCount, itemData }: any) => (
    <div data-testid="virtual-list">
      {Array.from({ length: itemCount }).map((_, index) => (
        <div key={index}>
            <Row index={index} style={{}} data={itemData} />
        </div>
      ))}
    </div>
  );
  VariableSizeList.displayName = "VariableSizeList";
  return {
    VariableSizeList,
    areEqual: () => true
  };
});

const defaultProps = {
  rows: [],
  rowHeight: 36,
  height: 600,
  showTimestampColumn: true,
};

const renderWithTheme = (component: React.ReactNode) => {
  return render(
    <ThemeProvider theme={ThemeNodetool}>
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
