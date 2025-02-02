# nodetool.nodes.nodetool.date

## AddTimeDelta

Add or subtract time from a datetime.

Use cases:
- Calculate future/past dates
- Generate date ranges

**Tags:** datetime, add, subtract

**Fields:**
- **input_datetime**: Starting datetime (Datetime)
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
- **start_date**: Start datetime (Datetime)
- **end_date**: End datetime (Datetime)


## DateFormat

## DateRange

Generate a list of dates between start and end dates.

Use cases:
- Generate date sequences
- Create date-based iterations

**Tags:** datetime, range, list

**Fields:**
- **start_date**: Start date of the range (Datetime)
- **end_date**: End date of the range (Datetime)
- **step_days**: Number of days between each date (int)


## DateToDatetime

Convert a Date object to a Datetime object.

**Tags:** date, datetime, convert

**Fields:**
- **input_date**: Date to convert (Date)


## DatetimeToDate

Convert a Datetime object to a Date object.

**Tags:** date, datetime, convert

**Fields:**
- **input_datetime**: Datetime to convert (Datetime)


## DaysAgo

Get datetime from specified days ago.

**Tags:** datetime, past, days

**Fields:**
- **days**: Number of days ago (int)


## DaysFromNow

Get datetime specified days in the future.

**Tags:** datetime, future, days

**Fields:**
- **days**: Number of days in the future (int)


## EndOfDay

Get the datetime set to the end of the day (23:59:59).

**Tags:** datetime, day, end

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## EndOfMonth

Get the datetime set to the last day of the month.

**Tags:** datetime, month, end

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## EndOfWeek

Get the datetime set to the last day of the week (Sunday by default).

**Tags:** datetime, week, end

**Fields:**
- **input_datetime**: Input datetime (Datetime)
- **start_monday**: Consider Monday as start of week (False for Sunday) (bool)


## EndOfYear

Get the datetime set to the last day of the year.

**Tags:** datetime, year, end

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## FormatDateTime

Convert a datetime object to a formatted string.

Use cases:
- Standardize date formats
- Prepare dates for different systems

**Tags:** datetime, format, convert

**Fields:**
- **input_datetime**: Datetime object to format (Datetime)
- **output_format**: Desired output format (DateFormat)


## GetQuarter

Get the quarter number and start/end dates for a given datetime.

Use cases:
- Financial reporting periods
- Quarterly analytics

**Tags:** datetime, quarter, period

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## GetWeekday

Get the weekday name or number from a datetime.

Use cases:
- Get day names for scheduling
- Filter events by weekday

**Tags:** datetime, weekday, name

**Fields:**
- **input_datetime**: Input datetime (Datetime)
- **as_name**: Return weekday name instead of number (0-6) (bool)


## HoursAgo

Get datetime from specified hours ago.

**Tags:** datetime, past, hours

**Fields:**
- **hours**: Number of hours ago (int)


## HoursFromNow

Get datetime specified hours in the future.

**Tags:** datetime, future, hours

**Fields:**
- **hours**: Number of hours in the future (int)


## IsDateInRange

Check if a date falls within a specified range.

Use cases:
- Validate date ranges
- Filter date-based data

**Tags:** datetime, range, check

**Fields:**
- **check_date**: Date to check (Datetime)
- **start_date**: Start of date range (Datetime)
- **end_date**: End of date range (Datetime)
- **inclusive**: Include start and end dates in range (bool)


## MonthsAgo

Get datetime from specified months ago.

**Tags:** datetime, past, months

**Fields:**
- **months**: Number of months ago (int)


## MonthsFromNow

Get datetime specified months in the future.

**Tags:** datetime, future, months

**Fields:**
- **months**: Number of months in the future (int)


## Now

Get the current date and time.

**Tags:** datetime, current, now

**Fields:**


## ParseDate

Parse a date string into components.

**Tags:** date, parse, format

**Fields:**
- **date_string**: The date string to parse (str)
- **input_format**: Format of the input date string (DateFormat)


## ParseDateTime

Parse a date/time string into components.

Use cases:
- Extract date components from strings
- Convert between date formats

**Tags:** datetime, parse, format

**Fields:**
- **datetime_string**: The datetime string to parse (str)
- **input_format**: Format of the input datetime string (DateFormat)


## StartOfDay

Get the datetime set to the start of the day (00:00:00).

**Tags:** datetime, day, start

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## StartOfMonth

Get the datetime set to the first day of the month.

**Tags:** datetime, month, start

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## StartOfWeek

Get the datetime set to the first day of the week (Monday by default).

**Tags:** datetime, week, start

**Fields:**
- **input_datetime**: Input datetime (Datetime)
- **start_monday**: Consider Monday as start of week (False for Sunday) (bool)


## StartOfYear

Get the datetime set to the first day of the year.

**Tags:** datetime, year, start

**Fields:**
- **input_datetime**: Input datetime (Datetime)


## Today

Get the current date.

**Tags:** date, today, now

**Fields:**


