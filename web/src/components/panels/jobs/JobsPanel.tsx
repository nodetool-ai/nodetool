import { useMemo } from "react";
import { Box, CircularProgress, Typography, List, ListItem } from "@mui/material";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { Job } from "../../../stores/ApiTypes";
import { groupByDate } from "../../../utils/groupByDate";
import JobItem from "./JobItem";

const JobGroupHeader = ({ label }: { label: string }) => (
    <ListItem sx={{ pt: 1, pb: 0.5, px: 2 }}>
        <Typography
            variant="caption"
            sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "text.secondary",
                width: "100%",
                textAlign: "right",
                borderBottom: 1,
                borderColor: "divider",
                pb: 0.5
            }}
        >
            {label}
        </Typography>
    </ListItem>
);

const JobsListContent = ({ jobs }: { jobs: Job[] }) => {
    const items = useMemo(() => {
        // Sort by date descending
        const sorted = [...jobs].sort((a, b) => {
            const dateA = a.started_at ? new Date(a.started_at).getTime() : 0;
            const dateB = b.started_at ? new Date(b.started_at).getTime() : 0;
            return dateB - dateA;
        });

        const result: React.ReactNode[] = [];
        let currentGroup = "";

        sorted.forEach((job) => {
            const group = groupByDate(job.started_at || new Date().toISOString());
            if (group !== currentGroup) {
                currentGroup = group;
                result.push(<JobGroupHeader key={`header-${group}`} label={group} />);
            }
            result.push(<JobItem key={job.id} job={job} />);
        });

        return result;
    }, [jobs]);

    return <>{items}</>;
};

const JobsPanel = () => {
    const { data: jobs, isLoading, error } = useRunningJobs();

    if (isLoading) {
        return <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}><CircularProgress size={24} /></Box>;
    }
    if (error) {
        return <Box sx={{ p: 2, color: "error.main" }}><Typography variant="body2">Error loading jobs</Typography></Box>;
    }
    if (!jobs?.length) {
        return <Box sx={{ p: 5, color: "text.secondary" }}><Typography variant="body2">No running jobs</Typography></Box>;
    }

    return (
        <List sx={{ px: 0 }}>
            <JobsListContent jobs={jobs} />
        </List>
    );
};

export default JobsPanel;
