import React from "react";
import { render, screen } from "@testing-library/react";

// Mocks
jest.mock("../../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: {},
    fontSizeNormal: "",
    fontFamily1: "",
    fontFamily2: "",
    fontSizeSmall: "",
    fontSizeTiny: ""
  }
}));
jest.mock("../../../config/data_types", () => ({}));
jest.mock("../../../stores/ApiClient", () => ({ client: { GET: jest.fn() } }));
jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const state = { edges: [] };
    return selector(state);
  })
}));
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: () => ({
    addNotification: jest.fn()
  })
}));
jest.mock("../../node/DataTable/DataTable", () => ({
  __esModule: true,
  default: () => <div data-testid="data-table" />
}));
jest.mock("../../node/ColumnsManager", () => ({
  __esModule: true,
  default: () => <div data-testid="columns-manager" />
}));
jest.mock("../DataframeEditorModal", () => ({
  __esModule: true,
  default: () => <div data-testid="dataframe-editor-modal" />
}));

// Mock the MUI theme hook
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    vars: {
      palette: {
        grey: {
          0: "#ffffff",
          100: "#f5f5f5",
          400: "#bdbdbd",
          500: "#9e9e9e",
          600: "#757575",
          800: "#424242",
          900: "#212121"
        },
        primary: {
          main: "#1976d2",
          light: "#42a5f5",
          mainChannel: "25, 118, 210"
        },
        action: {
          hover: "rgba(0, 0, 0, 0.04)"
        },
        text: {
          primary: "#fff",
          secondary: "#bdbdbd"
        },
        common: {
          white: "#fff",
          black: "#000"
        },
        background: {
          paper: "#424242",
          default: "#303030"
        }
      }
    },
    fontFamily1: "Arial",
    fontFamily2: "Arial",
    fontSizeTiny: "11px",
    fontSizeNormal: "14px",
    fontSizeSmall: "12px",
    spacing: (value: number) => `${value * 8}px`
  })
}));

import DataframeProperty from "../DataframeProperty";

const defaultProps = {
  property: {
    name: "dataframe",
    description: "A dataframe property",
    type: { type: "dataframe", optional: false, type_args: [] }
  } as any,
  propertyIndex: "0",
  value: {
    type: "dataframe" as const,
    uri: "",
    columns: [],
    data: []
  },
  onChange: jest.fn(),
  nodeId: "node1",
  nodeType: "test.DataFrame"
};

describe("DataframeProperty", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("for constant DataFrame node", () => {
    const constantProps = {
      ...defaultProps,
      nodeType: "nodetool.constant.DataFrame"
    };

    it("renders the drop zone for CSV/Excel files", () => {
      render(<DataframeProperty {...constantProps} />);
      expect(screen.getByText("Drop CSV or Excel file")).toBeInTheDocument();
    });

    it("displays supported file types hint", () => {
      render(<DataframeProperty {...constantProps} />);
      expect(screen.getByText("Supported: CSV, XLSX, XLS")).toBeInTheDocument();
    });

    it("renders Add Column button", () => {
      render(<DataframeProperty {...constantProps} />);
      expect(
        screen.getByRole("button", { name: /Add Column/i })
      ).toBeInTheDocument();
    });

    it("does not render DataTable when there is no data", () => {
      render(<DataframeProperty {...constantProps} />);
      expect(screen.queryByTestId("data-table")).not.toBeInTheDocument();
    });

    it("renders DataTable when there is data", () => {
      const propsWithData = {
        ...constantProps,
        value: {
          type: "dataframe" as const,
          uri: "",
          columns: [{ name: "col1", data_type: "string" as const, description: "" }],
          data: [["value1"]]
        }
      };
      render(<DataframeProperty {...propsWithData} />);
      expect(screen.getByTestId("data-table")).toBeInTheDocument();
    });
  });

  describe("for non-constant DataFrame node", () => {
    it("renders property label", () => {
      render(<DataframeProperty {...defaultProps} />);
      expect(screen.getByText("Dataframe")).toBeInTheDocument();
    });

    it("does not render drop zone", () => {
      render(<DataframeProperty {...defaultProps} />);
      expect(
        screen.queryByText("Drop CSV or Excel file")
      ).not.toBeInTheDocument();
    });
  });
});
