import React, { useState, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFnsV3";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";

interface CustomDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange
}) => {
  const theme = useTheme();
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    new Date(value)
  );

  const handleDateChange = useCallback((date: Date | null) => {
    setSelectedDate(date);
  }, []);

  const handleDateClose = useCallback(() => {
    if (selectedDate) {
      onChange(selectedDate.toISOString());
    }
  }, [selectedDate, onChange]);

  const handleKeyPress = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      handleDateClose();
    }
  }, [handleDateClose]);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div onKeyDown={handleKeyPress}>
        <DateTimePicker
          value={selectedDate}
          onChange={handleDateChange}
          onClose={handleDateClose}
          slotProps={{
            popper: {
              style: { zIndex: theme.zIndex.popover2 }
            }
          }}
        />
      </div>
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
