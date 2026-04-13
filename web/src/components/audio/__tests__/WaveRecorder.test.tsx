/**
 * Tests for WaveRecorder component
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WaveRecorder from "../WaveRecorder";

import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

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
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider theme={mockTheme}>{children}</ThemeProvider>
  );
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
      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
      const recordButton = screen.getByRole("button", { name: "RECORD" });
      expect(recordButton).toBeInTheDocument();
    });

    it("should render device button", () => {
      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
      const deviceButtons = screen.getAllByRole("button");
      expect(deviceButtons.length).toBeGreaterThan(0);
    });

    it("should not show device list when not visible", () => {
      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
      const deviceSelect = screen.queryByTestId("device-select");
      expect(deviceSelect).not.toBeInTheDocument();
    });
  });

  describe("Record Button", () => {
    it("should call handleRecord when record button is clicked", async () => {
      const user = userEvent.setup();
      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });

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

      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
      const recordButton = screen.getByRole("button", { name: /RECORD/i });
      expect(recordButton).toBeDisabled();
    });
  });

  describe("Device Button", () => {
    it("should call toggleDeviceListVisibility when clicked", async () => {
      const user = userEvent.setup();
      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });

      const deviceButtons = screen.getAllByRole("button");
      const deviceButton = deviceButtons[1]; // Second button is device button
      await user.click(deviceButton);

      expect(mockToggleDeviceListVisibility).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Display", () => {
    it("should not display error when error is null", () => {
      const { container } = render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
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

      render(<WaveRecorder onChange={mockOnChange} />, { wrapper });
      expect(screen.getByText("Test error message")).toBeInTheDocument();
    });
  });
});
