import React, { memo } from "react";
import { CardContent } from "@mui/material";
import { Text, FlexRow, Card, Chip } from "../ui_primitives";
import { CalendarEvent, Datetime } from "../../stores/ApiTypes";
import EventIcon from "@mui/icons-material/Event";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import NotesIcon from "@mui/icons-material/Notes";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

interface CalendarEventViewProps {
  event: CalendarEvent;
}

const formatDatetime = (dt: Datetime | string | null | undefined): string => {
  if (!dt) return "";
  if (typeof dt === "string") return dt;
  // Construct a date object. Note: Month is 1-indexed in the API but 0-indexed in JS Date
  const date = new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    dt.second
  );
  return date.toLocaleString();
};

const CalendarEventView: React.FC<CalendarEventViewProps> = ({ event }) => {
  return (
    <Card sx={{ minWidth: 275, maxWidth: 600, m: 1, boxShadow: 3 }}>
      <CardContent>
        <FlexRow align="center" sx={{ mb: 2 }}>
          <EventIcon color="primary" sx={{ mr: 1 }} />
          <Text size="normal" weight={600} component="div">
            {event.title}
          </Text>
        </FlexRow>

        <FlexRow align="center" sx={{ mb: 1 }}>
          <AccessTimeIcon fontSize="small" color="action" sx={{ mr: 1 }} />
          <Text size="small" color="secondary">
            {formatDatetime(event.start_date)} - {formatDatetime(event.end_date)}
          </Text>
        </FlexRow>

        {event.location && (
          <FlexRow align="center" sx={{ mb: 1 }}>
            <LocationOnIcon fontSize="small" color="action" sx={{ mr: 1 }} />
            <Text size="small" color="secondary">
              {event.location}
            </Text>
          </FlexRow>
        )}

        {event.calendar && (
          <div style={{ marginBottom: 8, marginTop: 8 }}>
            <Chip label={event.calendar} size="small" variant="outlined" />
          </div>
        )}

        {event.notes && (
          <FlexRow align="flex-start" sx={{ mt: 2 }}>
            <NotesIcon fontSize="small" color="action" sx={{ mr: 1, mt: 0.5 }} />
            <Text size="small" sx={{ whiteSpace: "pre-wrap" }}>
              {event.notes}
            </Text>
          </FlexRow>
        )}
      </CardContent>
    </Card>
  );
};

export default memo(CalendarEventView);
