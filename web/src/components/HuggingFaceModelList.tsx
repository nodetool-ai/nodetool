import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { client } from '../stores/ApiClient';
import { Button, CircularProgress, List, ListItem, ListItemText, Typography } from '@mui/material';

const HuggingFaceModelList: React.FC = () => {
    const { data: models, isLoading, error } = useQuery({
        queryKey: ['huggingFaceModels'],
        queryFn: async () => {
            const { data, error } = await client.GET("/api/models/huggingface_models", {});
            if (error) throw error;
            return data;
        }
    });

    // delete mutation
    const deleteModel = async (repoId: string) => {
        const { error } = await client.DELETE("/api/models/huggingface_model", {
            params: { query: { repo_id: repoId } }
        });
        if (error) throw error;
    }
    const mutation = useMutation({
        mutationFn: deleteModel
    });

    if (isLoading) {
        return <CircularProgress />;
    }

    if (error) {
        return <Typography color="error"> {error.message} </Typography>;
    }

    const modelList = (
        models?.map((model) => (
            <ListItem key={model.repo_id} >
                <ListItemText
                    primary={model.repo_id}
                    secondary={`Size: ${(model.size_on_disk / 1024 / 1024).toFixed(2)} MB`} />
                <Button onClick={() => mutation.mutate(model.repo_id)}>Delete</Button>
            </ListItem>
        ))
    );
    return (
        <>
            {mutation.isPending && <CircularProgress />}
            {mutation.isError && <Typography color="error">{mutation.error.message}</Typography>}
            {mutation.isSuccess && <Typography color="success">Model deleted successfully</Typography>}
            <List>
                {modelList}
            </List>
        </>
    );
};

export default HuggingFaceModelList;
