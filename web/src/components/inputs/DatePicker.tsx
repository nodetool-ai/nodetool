import React, { useState, useEffect } from "react";
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    new Date(value)
  );

  useEffect(() => {
    setSelectedDate(new Date(value));
  }, [value]);

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  const handleDateClose = () => {
    if (selectedDate) {
      onChange(selectedDate.toISOString());
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DateTimePicker
        value={selectedDate}
        onChange={handleDateChange}
        onClose={handleDateClose}
      />
    </LocalizationProvider>
  );
};

export default CustomDatePicker;
