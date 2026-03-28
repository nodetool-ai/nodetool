import { useMemo, memo } from "react";
import { Box, List, ListItem } from "@mui/material";
import { useRunningJobs } from "../../../hooks/useRunningJobs";
import { Job } from "../../../stores/ApiTypes";
import { groupByDate } from "../../../utils/groupByDate";
import JobItem from "./JobItem";
import { LoadingSpinner, Text, FlexColumn } from "../../ui_primitives";

const JobGroupHeader = memo(function JobGroupHeader({ label }: { label: string }) {
    return (
    <ListItem sx={{ pt: 1, pb: 0.5, px: 2 }}>
        <Text
            size="tiny"
            color="secondary"
            weight={600}
            sx={{
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                width: "100%",
                textAlign: "right",
                borderBottom: 1,
                borderColor: "divider",
                pb: 0.5
            }}
        >
            {label}
        </Text>
    </ListItem>
    );
});

JobGroupHeader.displayName = "JobGroupHeader";

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

const JobsPanel = memo(function JobsPanel() {
    const { data: jobs, isLoading, error } = useRunningJobs();

    if (isLoading) {
        return <FlexColumn align="center" padding={2}><LoadingSpinner size="small" /></FlexColumn>;
    }
    if (error) {
        return <Box sx={{ p: 2 }}><Text size="small" color="error">Error loading jobs</Text></Box>;
    }
    if (!jobs?.length) {
        return <Box sx={{ p: 5 }}><Text size="small" color="secondary">No running jobs</Text></Box>;
    }

    return (
        <List sx={{ px: 0 }}>
            <JobsListContent jobs={jobs} />
        </List>
    );
});

JobsPanel.displayName = "JobsPanel";

export default memo(JobsPanel);
