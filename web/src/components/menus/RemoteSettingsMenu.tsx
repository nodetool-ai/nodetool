import { useEffect, useState } from "react";
import { TextField, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";

const RemoteSettings = () => {
    const { updateSettings: updateRemoteSettings, fetchSettings } = useRemoteSettingsStore((state) => ({
        updateSettings: state.updateSettings,
        fetchSettings: state.fetchSettings,
    }));

    const { data, isSuccess, isLoading } = useQuery({
        queryKey: ["settings"],
        queryFn: fetchSettings,
    });

    const [comfyFolder, setComfyFolder] = useState("");
    const [openaiApiKey, setOpenaiApiKey] = useState("");
    const [hfToken, setHfToken] = useState("");
    const [replicateApiToken, setReplicateApiToken] = useState("");

    useEffect(() => {
        if (isSuccess) {
            setComfyFolder(data.settings.COMFY_FOLDER || "");
            setOpenaiApiKey(data.secrets.OPENAI_API_KEY || "");
            setHfToken(data.secrets.HF_TOKEN || "");
            setReplicateApiToken(data.secrets.REPLICATE_API_TOKEN || "");
        }
    }, [isSuccess, data]);

    return (
        <>
            {isLoading && <Typography>Loading...</Typography>}
            {isSuccess ? (
                <>
                    <div className="settings-item">
                        <TextField
                            id="comfy-folder-input"
                            label="Comfy Folder"
                            value={comfyFolder}
                            onChange={(e) => setComfyFolder(e.target.value)}
                            onBlur={() => updateRemoteSettings({ COMFY_FOLDER: comfyFolder }, {})}
                            variant="standard"
                        />
                        <Typography className="description">
                            Path to the Comfy folder.
                        </Typography>
                    </div>

                    <div className="settings-item">
                        <TextField
                            id="openai-api-key-input"
                            label="OpenAI API Key"
                            value={openaiApiKey}
                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                            onBlur={() => updateRemoteSettings({}, { OPENAI_API_KEY: openaiApiKey })}
                            variant="standard"
                        />
                        <Typography className="description">
                            Your OpenAI API key.
                        </Typography>
                    </div>

                    <div className="settings-item">
                        <TextField
                            id="hf-token-input"
                            label="Hugging Face Token"
                            value={hfToken}
                            onChange={(e) => setHfToken(e.target.value)}
                            onBlur={() => updateRemoteSettings({}, { HF_TOKEN: hfToken })}
                            variant="standard"
                        />
                        <Typography className="description">
                            Your Hugging Face token.
                        </Typography>
                    </div>

                    <div className="settings-item">
                        <TextField
                            id="replicate-api-token-input"
                            label="Replicate API Token"
                            value={replicateApiToken}
                            onChange={(e) => setReplicateApiToken(e.target.value)}
                            onBlur={() => updateRemoteSettings({}, { REPLICATE_API_TOKEN: replicateApiToken })}
                            variant="standard"
                        />
                        <Typography className="description">
                            Your Replicate API token.
                        </Typography>
                    </div>
                </>
            ) : null}
        </>
    );
};

export default RemoteSettings;