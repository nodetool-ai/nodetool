/**
 * Tests for WaveRecorder component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WaveRecorder from "../WaveRecorder";

// Mock useTheme hook
jest.mock("@mui/material/styles", () => ({
  ...jest.requireActual("@mui/material/styles"),
  useTheme: () => ({
    palette: {
      primary: { main: "#000" },
      secondary: { main: "#fff" },
      error: { main: "#f00" },
      text: { primary: "#000", secondary: "#666" },
      grey: {
        50: "#fff", 100: "#f5f5f5", 200: "#eee", 300: "#e0e0e0", 400: "#bdbdbd",
        500: "#9e9e9e", 600: "#757575", 700: "#616161", 800: "#424242", 900: "#212121"
      },
      divider: "#ccc"
    },
    vars: {
      palette: {
        primary: { main: "#000" },
        error: { main: "#f00" },
        grey: {
          100: "#f5f5f5", 200: "#eee", 600: "#757575", 700: "#616161",
          800: "#424242", 900: "#212121"
        }
      }
    },
    fontSize: 14,
    fontSizeSmall: 12,
    fontSizeTiny: 10
  })
}));

// Mock the useWaveRecorder hook
const mockHandleRecord = jest.fn();
const mockToggleDeviceListVisibility = jest.fn();
const mockHandleInputDeviceChange = jest.fn();
const mockSetError = jest.fn();

const mockUseWaveRecorder = jest.fn(() => ({
  error: null as string | null,
  setError: mockSetError,
  micRef: { current: null },
  handleRecord: mockHandleRecord,
  isRecording: false,
  isLoading: false,
  audioInputDevices: [
    { deviceId: "", label: "System default input" },
    { deviceId: "device1", label: "Microphone 1" }
  ],
  isDeviceListVisible: false,
  toggleDeviceListVisibility: mockToggleDeviceListVisibility,
  selectedInputDeviceId: "",
  handleInputDeviceChange: mockHandleInputDeviceChange
}));

jest.mock("../../../hooks/browser/useWaveRecorder", () => ({
  useWaveRecorder: () => mockUseWaveRecorder()
}));

// Mock Select component
jest.mock("../../../components/inputs/Select", () => {
  return function MockSelect({ value, onChange, options }: any) {
    return (
      <select
        data-testid="device-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  };
});

describe("WaveRecorder", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default mock return value
    mockUseWaveRecorder.mockReturnValue({
      error: null,
      setError: mockSetError,
      micRef: { current: null },
      handleRecord: mockHandleRecord,
      isRecording: false,
      isLoading: false,
      audioInputDevices: [
        { deviceId: "", label: "System default input" },
        { deviceId: "device1", label: "Microphone 1" }
      ],
      isDeviceListVisible: false,
      toggleDeviceListVisibility: mockToggleDeviceListVisibility,
      selectedInputDeviceId: "",
      handleInputDeviceChange: mockHandleInputDeviceChange
    });
  });

  describe("Rendering", () => {
    it("should render record button", () => {
      render(<WaveRecorder onChange={mockOnChange} />);
      const recordButton = screen.getByRole("button", { name: "RECORD" });
      expect(recordButton).toBeInTheDocument();
    });

    it("should render device button", () => {
      render(<WaveRecorder onChange={mockOnChange} />);
      const deviceButtons = screen.getAllByRole("button");
      expect(deviceButtons.length).toBeGreaterThan(0);
    });

    it("should not show device list when not visible", () => {
      render(<WaveRecorder onChange={mockOnChange} />);
      const deviceSelect = screen.queryByTestId("device-select");
      expect(deviceSelect).not.toBeInTheDocument();
    });
  });

  describe("Record Button", () => {
    it("should call handleRecord when record button is clicked", async () => {
      const user = userEvent.setup();
      render(<WaveRecorder onChange={mockOnChange} />);

      const recordButton = screen.getByRole("button", { name: "RECORD" });
      await user.click(recordButton);

      expect(mockHandleRecord).toHaveBeenCalledTimes(1);
    });

    it("should be disabled when loading", () => {
      mockUseWaveRecorder.mockReturnValue({
        error: null,
        setError: mockSetError,
        micRef: { current: null },
        handleRecord: mockHandleRecord,
        isRecording: false,
        isLoading: true,
        audioInputDevices: [
          { deviceId: "", label: "System default input" }
        ],
        isDeviceListVisible: false,
        toggleDeviceListVisibility: mockToggleDeviceListVisibility,
        selectedInputDeviceId: "",
        handleInputDeviceChange: mockHandleInputDeviceChange
      });

      render(<WaveRecorder onChange={mockOnChange} />);
      const recordButton = screen.getByRole("button", { name: "RECORD" });
      expect(recordButton).toBeDisabled();
    });
  });

  describe("Device Button", () => {
    it("should call toggleDeviceListVisibility when clicked", async () => {
      const user = userEvent.setup();
      render(<WaveRecorder onChange={mockOnChange} />);

      const deviceButtons = screen.getAllByRole("button");
      const deviceButton = deviceButtons[1]; // Second button is device button
      await user.click(deviceButton);

      expect(mockToggleDeviceListVisibility).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Display", () => {
    it("should not display error when error is null", () => {
      const { container } = render(<WaveRecorder onChange={mockOnChange} />);
      const errorElement = container.querySelector(".error");
      expect(errorElement).not.toBeInTheDocument();
    });

    it("should display error message when error exists", () => {
      mockUseWaveRecorder.mockReturnValue({
        error: "Test error message",
        setError: mockSetError,
        micRef: { current: null },
        handleRecord: mockHandleRecord,
        isRecording: false,
        isLoading: false,
        audioInputDevices: [
          { deviceId: "", label: "System default input" }
        ],
        isDeviceListVisible: false,
        toggleDeviceListVisibility: mockToggleDeviceListVisibility,
        selectedInputDeviceId: "",
        handleInputDeviceChange: mockHandleInputDeviceChange
      });

      render(<WaveRecorder onChange={mockOnChange} />);
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });
  });
});
