import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../stores/ApiClient';
import { Button, CircularProgress, List, ListItem, ListItemText, Typography } from '@mui/material';

const HuggingFaceModelList: React.FC = () => {
    const [deletingModels, setDeletingModels] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

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
        setDeletingModels(prev => new Set(prev).add(repoId));
        try {
            const { error } = await client.DELETE("/api/models/huggingface_model", {
                params: { query: { repo_id: repoId } }
            });
            if (error) throw error;
            queryClient.setQueryData(['huggingFaceModels'], (oldData: any) =>
                oldData.filter((model: any) => model.repo_id !== repoId)
            );
        } finally {
            setDeletingModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(repoId);
                return newSet;
            });
        }
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
            <ListItem key={model.repo_id}>
                <ListItemText
                    primary={model.repo_id}
                    secondary={`Size: ${(model.size_on_disk / 1024 / 1024).toFixed(2)} MB`} />
                {deletingModels.has(model.repo_id) ? (
                    <CircularProgress size={24} />
                ) : (
                    <Button onClick={() => mutation.mutate(model.repo_id)}>Delete</Button>
                )}
            </ListItem>
        ))
    );

    return (
        <>
            <List>
                {modelList}
            </List>
        </>
    );
};

export default HuggingFaceModelList;
