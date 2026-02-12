import React, { memo } from "react";
import { Card, CardContent, Typography, Box, Chip } from "@mui/material";
import { CalendarEvent, Datetime } from "../../stores/ApiTypes";
import EventIcon from "@mui/icons-material/Event";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import NotesIcon from "@mui/icons-material/Notes";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

interface CalendarEventViewProps {
  event: CalendarEvent;
}

const formatDatetime = (dt: Datetime): string => {
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
        <Box display="flex" alignItems="center" mb={2}>
          <EventIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" component="div">
            {event.title}
          </Typography>
        </Box>

        <Box display="flex" alignItems="center" mb={1}>
          <AccessTimeIcon fontSize="small" color="action" sx={{ mr: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {formatDatetime(event.start_date)} - {formatDatetime(event.end_date)}
          </Typography>
        </Box>

        {event.location && (
          <Box display="flex" alignItems="center" mb={1}>
            <LocationOnIcon fontSize="small" color="action" sx={{ mr: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {event.location}
            </Typography>
          </Box>
        )}

        {event.calendar && (
          <Box mb={1} mt={1}>
            <Chip label={event.calendar} size="small" variant="outlined" />
          </Box>
        )}

        {event.notes && (
          <Box display="flex" alignItems="flex-start" mt={2}>
            <NotesIcon fontSize="small" color="action" sx={{ mr: 1, mt: 0.5 }} />
            <Typography variant="body2" style={{ whiteSpace: "pre-wrap" }}>
              {event.notes}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default memo(CalendarEventView);
