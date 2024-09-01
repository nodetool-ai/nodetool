import { create } from 'zustand';

interface Download {
    ws: WebSocket;
    output: string;
}

interface HuggingFaceStore {
    downloads: Record<string, Download>;
    addDownload: (repoId: string, download: Download) => void;
    updateDownload: (repoId: string, output: string) => void;
}

export const useHuggingFaceStore = create<HuggingFaceStore>((set) => ({
    downloads: {},
    addDownload: (repoId, download) => set((state) => ({
        downloads: { ...state.downloads, [repoId]: download },
    })),
    updateDownload: (repoId: string, output: string) => set((state) => ({
        downloads: {
            ...state.downloads,
            [repoId]: {
                ...state.downloads[repoId],
                output: state.downloads[repoId].output + output,
            },
        },
    })),
}));