# nodetool.nodes.nodetool.datetime

## AddTimeDelta

Add or subtract time from a datetime.

Use cases:
- Calculate future/past dates
- Generate date ranges

**Tags:** datetime, add, subtract

**Fields:**
- **input_datetime**: Starting datetime (datetime)
- **days**: Number of days to add (negative to subtract) (int)
- **hours**: Number of hours to add (negative to subtract) (int)
- **minutes**: Number of minutes to add (negative to subtract) (int)


## DateDifference

Calculate the difference between two dates.

Use cases:
- Calculate time periods
- Measure durations

**Tags:** datetime, difference, duration

**Fields:**
- **start_date**: Start datetime (datetime)
- **end_date**: End datetime (datetime)


## DateFormat

## DateRange

Generate a list of dates between start and end dates.

Use cases:
- Generate date sequences
- Create date-based iterations

**Tags:** datetime, range, list

**Fields:**
- **start_date**: Start date of the range (datetime)
- **end_date**: End date of the range (datetime)
- **step_days**: Number of days between each date (int)


## FormatDateTime

Convert a datetime object to a formatted string.

Use cases:
- Standardize date formats
- Prepare dates for different systems

**Tags:** datetime, format, convert

**Fields:**
- **input_datetime**: Datetime object to format (datetime)
- **output_format**: Desired output format (DateFormat)


## GetCurrentDateTime

Get the current date and time.

Use cases:
- Add timestamps to data
- Calculate time-based metrics

**Tags:** datetime, current, now

**Fields:**


## GetQuarter

Get the quarter number and start/end dates for a given datetime.

Use cases:
- Financial reporting periods
- Quarterly analytics

**Tags:** datetime, quarter, period

**Fields:**
- **input_datetime**: Input datetime (datetime)


## GetWeekday

Get the weekday name or number from a datetime.

Use cases:
- Get day names for scheduling
- Filter events by weekday

**Tags:** datetime, weekday, name

**Fields:**
- **input_datetime**: Input datetime (datetime)
- **as_name**: Return weekday name instead of number (0-6) (bool)


## IsDateInRange

Check if a date falls within a specified range.

Use cases:
- Validate date ranges
- Filter date-based data

**Tags:** datetime, range, check

**Fields:**
- **check_date**: Date to check (datetime)
- **start_date**: Start of date range (datetime)
- **end_date**: End of date range (datetime)
- **inclusive**: Include start and end dates in range (bool)


## MakeDateTime

Make a datetime object from year, month, day, hour, minute, second.

**Tags:** datetime, make, create

**Fields:**
- **year**: Year of the datetime (int)
- **month**: Month of the datetime (int)
- **day**: Day of the datetime (int)
- **hour**: Hour of the datetime (int)
- **minute**: Minute of the datetime (int)
- **second**: Second of the datetime (int)


## ParseDateTime

Parse a date/time string into components.

Use cases:
- Extract date components from strings
- Convert between date formats

**Tags:** datetime, parse, format

**Fields:**
- **datetime_string**: The datetime string to parse (str)
- **input_format**: Format of the input datetime string (DateFormat)


