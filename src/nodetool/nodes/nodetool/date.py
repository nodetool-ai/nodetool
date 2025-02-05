from datetime import datetime, timedelta, date
from enum import Enum
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Datetime, Date


class DateFormat(str, Enum):
    ISO = "%Y-%m-%d"
    US = "%m/%d/%Y"
    EUROPEAN = "%d/%m/%Y"
    HUMAN_READABLE = "%B %d, %Y"
    COMPACT = "%Y%m%d"
    FILENAME = "%Y%m%d_%H%M%S"
    ISO_WITH_TIME = "%Y-%m-%dT%H:%M:%S"
    ISO_WITH_TIMEZONE = "%Y-%m-%dT%H:%M:%S%z"
    ISO_WITH_TIMEZONE_UTC = "%Y-%m-%dT%H:%M:%S%z"


class Today(BaseNode):
    """
    Get the current date.
    date, today, now
    """

    async def process(self, context: ProcessingContext) -> Date:
        return Date.from_date(date.today())


class Now(BaseNode):
    """
    Get the current date and time.
    datetime, current, now
    """

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(datetime.now())


class ParseDate(BaseNode):
    """
    Parse a date string into components.
    date, parse, format
    """

    date_string: str = Field(default="", description="The date string to parse")
    input_format: DateFormat = Field(
        default=DateFormat.ISO, description="Format of the input date string"
    )

    async def process(self, context: ProcessingContext) -> Date:
        return Date.from_date(
            datetime.strptime(self.date_string, self.input_format.value)
        )


class ParseDateTime(BaseNode):
    """
    Parse a date/time string into components.
    datetime, parse, format

    Use cases:
    - Extract date components from strings
    - Convert between date formats
    """

    datetime_string: str = Field(default="", description="The datetime string to parse")
    input_format: DateFormat = Field(
        default=DateFormat.ISO, description="Format of the input datetime string"
    )

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(
            datetime.strptime(self.datetime_string, self.input_format.value)
        )


class AddTimeDelta(BaseNode):
    """
    Add or subtract time from a datetime.
    datetime, add, subtract

    Use cases:
    - Calculate future/past dates
    - Generate date ranges
    """

    input_datetime: Datetime = Field(
        default=Datetime(), description="Starting datetime"
    )
    days: int = Field(
        ge=-365 * 10,
        le=365 * 10,
        default=0,
        description="Number of days to add (negative to subtract)",
    )
    hours: int = Field(
        ge=-24,
        le=24,
        default=0,
        description="Number of hours to add (negative to subtract)",
    )
    minutes: int = Field(
        ge=-60,
        le=60,
        default=0,
        description="Number of minutes to add (negative to subtract)",
    )

    async def process(self, context: ProcessingContext) -> Datetime:
        delta = timedelta(days=self.days, hours=self.hours, minutes=self.minutes)
        return Datetime.from_datetime(self.input_datetime.to_datetime() + delta)


class DateDifference(BaseNode):
    """
    Calculate the difference between two dates.
    datetime, difference, duration

    Use cases:
    - Calculate time periods
    - Measure durations
    """

    start_date: Datetime = Field(default=Datetime(), description="Start datetime")
    end_date: Datetime = Field(default=Datetime(), description="End datetime")

    @classmethod
    def return_type(cls):
        return {
            "total_seconds": int,
            "days": int,
            "hours": int,
            "minutes": int,
            "seconds": int,
        }

    async def process(self, context: ProcessingContext) -> dict:
        diff = self.end_date.to_datetime() - self.start_date.to_datetime()
        return {
            "total_seconds": int(diff.total_seconds()),
            "days": diff.days,
            "hours": diff.seconds // 3600,
            "minutes": (diff.seconds % 3600) // 60,
            "seconds": diff.seconds % 60,
        }


class FormatDateTime(BaseNode):
    """
    Convert a datetime object to a formatted string.
    datetime, format, convert

    Use cases:
    - Standardize date formats
    - Prepare dates for different systems
    """

    input_datetime: Datetime = Field(
        default=Datetime(),
        description="Datetime object to format",
    )
    output_format: DateFormat = Field(
        default=DateFormat.HUMAN_READABLE, description="Desired output format"
    )

    async def process(self, context: ProcessingContext) -> str:
        return self.input_datetime.to_datetime().strftime(self.output_format.value)


class GetWeekday(BaseNode):
    """
    Get the weekday name or number from a datetime.
    datetime, weekday, name

    Use cases:
    - Get day names for scheduling
    - Filter events by weekday
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")
    as_name: bool = Field(
        default=True, description="Return weekday name instead of number (0-6)"
    )

    async def process(self, context: ProcessingContext) -> str | int:
        if self.as_name:
            return self.input_datetime.to_datetime().strftime("%A")
        return self.input_datetime.to_datetime().weekday()


class DateRange(BaseNode):
    """
    Generate a list of dates between start and end dates.
    datetime, range, list

    Use cases:
    - Generate date sequences
    - Create date-based iterations
    """

    start_date: Datetime = Field(
        default=Datetime(),
        description="Start date of the range",
    )
    end_date: Datetime = Field(
        default=Datetime(),
        description="End date of the range",
    )
    step_days: int = Field(default=1, description="Number of days between each date")

    async def process(self, context: ProcessingContext) -> list[Datetime]:
        dates = []
        current = self.start_date
        while current.to_datetime() <= self.end_date.to_datetime():
            dates.append(current)
            current = Datetime.from_datetime(
                current.to_datetime() + timedelta(days=self.step_days)
            )
        return dates


class IsDateInRange(BaseNode):
    """
    Check if a date falls within a specified range.
    datetime, range, check

    Use cases:
    - Validate date ranges
    - Filter date-based data
    """

    check_date: Datetime = Field(default=Datetime(), description="Date to check")
    start_date: Datetime = Field(
        default=Datetime(),
        description="Start of date range",
    )
    end_date: Datetime = Field(
        default=Datetime(),
        description="End of date range",
    )
    inclusive: bool = Field(
        default=True, description="Include start and end dates in range"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.inclusive:
            return (
                self.start_date.to_datetime()
                <= self.check_date.to_datetime()
                <= self.end_date.to_datetime()
            )
        return (
            self.start_date.to_datetime()
            < self.check_date.to_datetime()
            < self.end_date.to_datetime()
        )


class GetQuarter(BaseNode):
    """
    Get the quarter number and start/end dates for a given datetime.
    datetime, quarter, period

    Use cases:
    - Financial reporting periods
    - Quarterly analytics
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    @classmethod
    def return_type(cls):
        return {
            "quarter": int,
            "quarter_start": Datetime,
            "quarter_end": Datetime,
        }

    async def process(self, context: ProcessingContext) -> dict:
        quarter = (self.input_datetime.month - 1) // 3 + 1
        quarter_start = datetime(self.input_datetime.year, 3 * quarter - 2, 1)

        if quarter == 4:
            quarter_end = Datetime.from_datetime(
                datetime(self.input_datetime.year + 1, 1, 1) - timedelta(days=1)
            )
        else:
            quarter_end = Datetime.from_datetime(
                datetime(self.input_datetime.year, 3 * quarter + 1, 1)
                - timedelta(days=1)
            )

        return {
            "quarter": quarter,
            "quarter_start": quarter_start,
            "quarter_end": quarter_end,
        }


class DateToDatetime(BaseNode):
    """
    Convert a Date object to a Datetime object.
    date, datetime, convert
    """

    input_date: Date = Field(default=Date(), description="Date to convert")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(
            datetime.combine(self.input_date.to_date(), datetime.min.time())
        )


class DatetimeToDate(BaseNode):
    """
    Convert a Datetime object to a Date object.
    date, datetime, convert
    """

    input_datetime: Datetime = Field(
        default=Datetime(),
        description="Datetime to convert",
    )

    async def process(self, context: ProcessingContext) -> Date:
        return Date.from_date(self.input_datetime.to_datetime().date())


class HoursAgo(BaseNode):
    """
    Get datetime from specified hours ago.
    datetime, past, hours
    """

    hours: int = Field(ge=0, default=1, description="Number of hours ago")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(datetime.now() - timedelta(hours=self.hours))


class HoursFromNow(BaseNode):
    """
    Get datetime specified hours in the future.
    datetime, future, hours
    """

    hours: int = Field(ge=0, default=1, description="Number of hours in the future")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(datetime.now() + timedelta(hours=self.hours))


class DaysAgo(BaseNode):
    """
    Get datetime from specified days ago.
    datetime, past, days
    """

    days: int = Field(ge=0, default=1, description="Number of days ago")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(datetime.now() - timedelta(days=self.days))


class DaysFromNow(BaseNode):
    """
    Get datetime specified days in the future.
    datetime, future, days
    """

    days: int = Field(ge=0, default=1, description="Number of days in the future")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime.from_datetime(datetime.now() + timedelta(days=self.days))


class MonthsAgo(BaseNode):
    """
    Get datetime from specified months ago.
    datetime, past, months
    """

    months: int = Field(ge=0, default=1, description="Number of months ago")

    async def process(self, context: ProcessingContext) -> Datetime:
        current = datetime.now()
        year = current.year
        month = current.month - self.months

        while month <= 0:
            month += 12
            year -= 1

        return Datetime.from_datetime(current.replace(year=year, month=month))


class MonthsFromNow(BaseNode):
    """
    Get datetime specified months in the future.
    datetime, future, months
    """

    months: int = Field(ge=0, default=1, description="Number of months in the future")

    async def process(self, context: ProcessingContext) -> Datetime:
        current = datetime.now()
        year = current.year
        month = current.month + self.months

        while month > 12:
            month -= 12
            year += 1

        return Datetime.from_datetime(current.replace(year=year, month=month))


class StartOfDay(BaseNode):
    """
    Get the datetime set to the start of the day (00:00:00).
    datetime, day, start
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        return Datetime.from_datetime(
            dt.replace(hour=0, minute=0, second=0, microsecond=0)
        )


class EndOfDay(BaseNode):
    """
    Get the datetime set to the end of the day (23:59:59).
    datetime, day, end
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        return Datetime.from_datetime(
            dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        )


class StartOfMonth(BaseNode):
    """
    Get the datetime set to the first day of the month.
    datetime, month, start
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        return Datetime.from_datetime(
            dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        )


class EndOfMonth(BaseNode):
    """
    Get the datetime set to the last day of the month.
    datetime, month, end
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        # Get first day of next month and subtract one day
        if dt.month == 12:
            next_month = dt.replace(year=dt.year + 1, month=1, day=1)
        else:
            next_month = dt.replace(month=dt.month + 1, day=1)
        return Datetime.from_datetime(next_month - timedelta(days=1))


class StartOfYear(BaseNode):
    """
    Get the datetime set to the first day of the year.
    datetime, year, start
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        return Datetime.from_datetime(
            dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        )


class EndOfYear(BaseNode):
    """
    Get the datetime set to the last day of the year.
    datetime, year, end
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        return Datetime.from_datetime(
            dt.replace(
                month=12, day=31, hour=23, minute=59, second=59, microsecond=999999
            )
        )


class StartOfWeek(BaseNode):
    """
    Get the datetime set to the first day of the week (Monday by default).
    datetime, week, start
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")
    start_monday: bool = Field(
        default=True, description="Consider Monday as start of week (False for Sunday)"
    )

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        weekday = dt.weekday() if self.start_monday else (dt.weekday() + 1) % 7
        return Datetime.from_datetime(
            (dt - timedelta(days=weekday)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
        )


class EndOfWeek(BaseNode):
    """
    Get the datetime set to the last day of the week (Sunday by default).
    datetime, week, end
    """

    input_datetime: Datetime = Field(default=Datetime(), description="Input datetime")
    start_monday: bool = Field(
        default=True, description="Consider Monday as start of week (False for Sunday)"
    )

    async def process(self, context: ProcessingContext) -> Datetime:
        dt = self.input_datetime.to_datetime()
        weekday = dt.weekday() if self.start_monday else (dt.weekday() + 1) % 7
        return Datetime.from_datetime(
            (dt + timedelta(days=6 - weekday)).replace(
                hour=23, minute=59, second=59, microsecond=999999
            )
        )
