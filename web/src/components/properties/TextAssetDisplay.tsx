import React, { useCallback, useRef } from "react";
import { useInfiniteQuery } from "react-query";
import axios from "axios";
import { useAssetStore } from "../../hooks/AssetStore";
import { devError } from "../../utils/DevLog";
import { Typography } from "@mui/material";

const CHUNK_SIZE = 4096;

const fetchText = async (url: string, start: number, end: number) => {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { Range: `bytes=${start}-${end}` }
    });
    return new TextDecoder().decode(new Uint8Array(response.data));
};

interface TextAssetDisplayProps {
    assetId: string;
}

function TextAssetDisplay({ assetId }: TextAssetDisplayProps) {
    const getAsset = useAssetStore((state) => state.get);
    const observerTarget = useRef(null);

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        status,
        error
    } = useInfiniteQuery(
        ["textAsset", assetId],
        async ({ pageParam = 0 }) => {
            const asset = await getAsset(assetId);
            if (!asset?.get_url) throw new Error("Asset has no get_url");
            const start = pageParam * CHUNK_SIZE;
            const end = start + CHUNK_SIZE - 1;
            return fetchText(asset.get_url, start, end);
        },
        {
            getNextPageParam: (lastPage, pages) => {
                if (lastPage.length < CHUNK_SIZE) return undefined;
                return pages.length;
            },
            onError: devError,
            retry: false,
        }
    );

    const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
        const [target] = entries;
        if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    React.useEffect(() => {
        const observer = new IntersectionObserver(handleObserver, {
            rootMargin: "0px 0px 400px 0px"
        });

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [handleObserver]);

    if (status === "loading") return <p>Loading...</p>;
    if (status === "error") return <p>Error loading data: {(error as Error).message}</p>;

    return (
        <div style={{ height: "300px", overflow: "scroll", scrollbarWidth: "thin" }}>
            <Typography variant="body1">
                {data?.pages.map((page, i) => (
                    <React.Fragment key={i}>{page}</React.Fragment>
                ))}
            </Typography>
            <div ref={observerTarget}>
                {isFetchingNextPage ? "Loading more..." : hasNextPage ? "Load more" : "No more data"}
            </div>
        </div>
    );
}

export default TextAssetDisplay;