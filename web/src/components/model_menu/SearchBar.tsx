/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { TextField } from "@mui/material";

export interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange }) => {
  const handleChange = useMemo(() => {
    let timer: any;
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log("[ModelMenu] search", v);
        onChange(v);
      }, 150);
    };
  }, [onChange]);

  return (
    <TextField
      defaultValue={value}
      size="small"
      fullWidth
      placeholder="Search models..."
      onChange={handleChange}
    />
  );
};

export default SearchBar;
