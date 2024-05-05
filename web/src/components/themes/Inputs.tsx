import React, { useState } from "react";
import {
  Autocomplete,
  Button,
  ButtonGroup,
  Checkbox,
  Fab,
  RadioGroup,
  Radio,
  FormControlLabel,
  Rating,
  Select,
  MenuItem,
  Slider,
  Switch,
  TextField,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";

function Inputs() {
  const [radioValue, setRadioValue] = useState("option1");
  const [selectValue, setSelectValue] = useState("");
  const [toggleValue, setToggleValue] = useState(false);

  return (
    <div style={{ padding: "20px" }}>
      <Autocomplete
        options={["Option1", "Option2", "Option3"]}
        renderInput={(params) => <TextField {...params} label="Autocomplete" />}
      />
      <Button variant="contained" color="primary" style={{}}>
        Button
      </Button>
      <ButtonGroup variant="contained" color="primary" style={{}}>
        <Button>Left</Button>
        <Button>Middle</Button>
        <Button>Right</Button>
      </ButtonGroup>
      <Checkbox color="primary" style={{}} /> Checkbox
      <Fab color="primary" aria-label="add" style={{}}>
        <AddIcon />
      </Fab>
      <RadioGroup
        value={radioValue}
        onChange={(e) => setRadioValue(e.target.value)}
        style={{}}
      >
        <FormControlLabel
          value="option1"
          control={<Radio />}
          label="Option 1"
        />
        <FormControlLabel
          value="option2"
          control={<Radio />}
          label="Option 2"
        />
      </RadioGroup>
      <Rating name="rating" style={{}} />
      <FormControl variant="outlined" style={{}}>
        <InputLabel>Select</InputLabel>
        <Select
          value={selectValue}
          onChange={(e) => setSelectValue(e.target.value)}
          label="Select"
        >
          <MenuItem value="Option1">Option1</MenuItem>
          <MenuItem value="Option2">Option2</MenuItem>
          <MenuItem value="Option3">Option3</MenuItem>
        </Select>
      </FormControl>
      <Slider defaultValue={30} aria-label="Slider" style={{}} />
      <Switch color="primary" style={{}} />
      <TextField label="Text Field" variant="outlined" style={{}} />
      <ToggleButtonGroup
        value={toggleValue}
        exclusive
        onChange={() => setToggleValue(!toggleValue)}
        style={{}}
      >
        <ToggleButton value={true}>Toggle On</ToggleButton>
        <ToggleButton value={false}>Toggle Off</ToggleButton>
      </ToggleButtonGroup>
    </div>
  );
}

export default Inputs;
