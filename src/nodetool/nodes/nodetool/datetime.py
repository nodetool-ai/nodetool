from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class DateFormat(str, Enum):
    ISO = "%Y-%m-%d"
    US = "%m/%d/%Y"
    EUROPEAN = "%d/%m/%Y"
    ISO_WITH_TIME = "%Y-%m-%dT%H:%M:%S"
    HUMAN_READABLE = "%B %d, %Y"
    COMPACT = "%Y%m%d"


class GetCurrentDateTime(BaseNode):
    """
    Get the current date and time.
    datetime, current, now

    Use cases:
    - Add timestamps to data
    - Calculate time-based metrics
    """

    format: DateFormat = Field(
        default=DateFormat.ISO_WITH_TIME, description="Output format for the datetime"
    )

    async def process(self, context: ProcessingContext) -> str:
        return datetime.now().strftime(self.format.value)


class MakeDateTime(BaseNode):
    """
    Make a datetime object from year, month, day, hour, minute, second.
    datetime, make, create
    """

    year: int = Field(default=datetime.now().year, description="Year of the datetime")
    month: int = Field(
        default=datetime.now().month, description="Month of the datetime"
    )
    day: int = Field(default=datetime.now().day, description="Day of the datetime")
    hour: int = Field(default=0, description="Hour of the datetime")
    minute: int = Field(default=0, description="Minute of the datetime")
    second: int = Field(default=0, description="Second of the datetime")

    async def process(self, context: ProcessingContext) -> datetime:
        return datetime(
            self.year, self.month, self.day, self.hour, self.minute, self.second
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

    @classmethod
    def return_type(cls):
        return {
            "year": int,
            "month": int,
            "day": int,
            "hour": int,
            "minute": int,
            "second": int,
            "weekday": int,
        }

    async def process(self, context: ProcessingContext) -> dict:
        dt = datetime.strptime(self.datetime_string, self.input_format.value)
        return {
            "year": dt.year,
            "month": dt.month,
            "day": dt.day,
            "hour": dt.hour,
            "minute": dt.minute,
            "second": dt.second,
            "weekday": dt.weekday(),
        }


class AddTimeDelta(BaseNode):
    """
    Add or subtract time from a datetime.
    datetime, add, subtract

    Use cases:
    - Calculate future/past dates
    - Generate date ranges
    """

    input_datetime: datetime = Field(
        default_factory=datetime.now, description="Starting datetime"
    )
    days: int = Field(
        default=0, description="Number of days to add (negative to subtract)"
    )
    hours: int = Field(
        default=0, description="Number of hours to add (negative to subtract)"
    )
    minutes: int = Field(
        default=0, description="Number of minutes to add (negative to subtract)"
    )

    async def process(self, context: ProcessingContext) -> datetime:
        delta = timedelta(days=self.days, hours=self.hours, minutes=self.minutes)
        return self.input_datetime + delta


class DateDifference(BaseNode):
    """
    Calculate the difference between two dates.
    datetime, difference, duration

    Use cases:
    - Calculate time periods
    - Measure durations
    """

    start_date: datetime = Field(
        default_factory=datetime.now, description="Start datetime"
    )
    end_date: datetime = Field(default_factory=datetime.now, description="End datetime")

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
        diff = self.end_date - self.start_date
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

    input_datetime: datetime = Field(
        default_factory=datetime.now, description="Datetime object to format"
    )
    output_format: DateFormat = Field(
        default=DateFormat.HUMAN_READABLE, description="Desired output format"
    )

    async def process(self, context: ProcessingContext) -> str:
        return self.input_datetime.strftime(self.output_format.value)


class GetWeekday(BaseNode):
    """
    Get the weekday name or number from a datetime.
    datetime, weekday, name

    Use cases:
    - Get day names for scheduling
    - Filter events by weekday
    """

    input_datetime: datetime = Field(
        default_factory=datetime.now, description="Input datetime"
    )
    as_name: bool = Field(
        default=True, description="Return weekday name instead of number (0-6)"
    )

    async def process(self, context: ProcessingContext) -> str | int:
        if self.as_name:
            return self.input_datetime.strftime("%A")
        return self.input_datetime.weekday()


class DateRange(BaseNode):
    """
    Generate a list of dates between start and end dates.
    datetime, range, list

    Use cases:
    - Generate date sequences
    - Create date-based iterations
    """

    start_date: datetime = Field(
        default_factory=datetime.now, description="Start date of the range"
    )
    end_date: datetime = Field(
        default_factory=lambda: datetime.now() + timedelta(days=7),
        description="End date of the range",
    )
    step_days: int = Field(default=1, description="Number of days between each date")

    async def process(self, context: ProcessingContext) -> list[datetime]:
        dates = []
        current = self.start_date
        while current <= self.end_date:
            dates.append(current)
            current += timedelta(days=self.step_days)
        return dates


class IsDateInRange(BaseNode):
    """
    Check if a date falls within a specified range.
    datetime, range, check

    Use cases:
    - Validate date ranges
    - Filter date-based data
    """

    check_date: datetime = Field(
        default_factory=datetime.now, description="Date to check"
    )
    start_date: datetime = Field(
        default_factory=datetime.now, description="Start of date range"
    )
    end_date: datetime = Field(
        default_factory=lambda: datetime.now() + timedelta(days=1),
        description="End of date range",
    )
    inclusive: bool = Field(
        default=True, description="Include start and end dates in range"
    )

    async def process(self, context: ProcessingContext) -> bool:
        if self.inclusive:
            return self.start_date <= self.check_date <= self.end_date
        return self.start_date < self.check_date < self.end_date


class GetQuarter(BaseNode):
    """
    Get the quarter number and start/end dates for a given datetime.
    datetime, quarter, period

    Use cases:
    - Financial reporting periods
    - Quarterly analytics
    """

    input_datetime: datetime = Field(
        default_factory=datetime.now, description="Input datetime"
    )

    @classmethod
    def return_type(cls):
        return {
            "quarter": int,
            "quarter_start": datetime,
            "quarter_end": datetime,
        }

    async def process(self, context: ProcessingContext) -> dict:
        quarter = (self.input_datetime.month - 1) // 3 + 1
        quarter_start = datetime(self.input_datetime.year, 3 * quarter - 2, 1)
        if quarter == 4:
            quarter_end = datetime(self.input_datetime.year + 1, 1, 1) - timedelta(
                days=1
            )
        else:
            quarter_end = datetime(
                self.input_datetime.year, 3 * quarter + 1, 1
            ) - timedelta(days=1)

        return {
            "quarter": quarter,
            "quarter_start": quarter_start,
            "quarter_end": quarter_end,
        }
