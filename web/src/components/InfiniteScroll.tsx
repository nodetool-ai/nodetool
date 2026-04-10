import React, { useEffect, useCallback, useRef, ReactNode, memo } from 'react';
import { Box } from '@mui/material';

interface InfiniteScrollProps {
    next: () => void | Promise<unknown>;
    hasMore: boolean;
    loader: ReactNode;
    children: ReactNode;
    threshold?: number;
    className?: string;
    /** Optional label for screen readers */
    'aria-label'?: string;
    /** Accessible name for the loading indicator */
    loadingLabel?: string;
}

const InfiniteScroll: React.FC<InfiniteScrollProps> = memo(function InfiniteScroll({
    next,
    hasMore,
    loader,
    children,
    threshold = 100,
    className = '',
    'aria-label': ariaLabel = 'Scrollable content',
    loadingLabel = 'Loading more items',
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const ticking = useRef(false);
    const loadingPromise = useRef<Promise<unknown> | null>(null);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current || !hasMore || ticking.current || loadingPromise.current) {
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop - clientHeight < threshold) {
            // Track the loading promise to prevent concurrent loads
            loadingPromise.current = Promise.resolve(next()).finally(() => {
                loadingPromise.current = null;
            });
        }

        window.requestAnimationFrame(() => {
            ticking.current = false;
        });

        ticking.current = true;
    }, [hasMore, next, threshold]);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        if (scrollContainer) {
            // Use passive event listener for better scroll performance
            scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
            return () => scrollContainer.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    return (
        <Box
            ref={scrollRef}
            role="region"
            aria-label={ariaLabel}
            aria-live="polite"
            aria-busy={hasMore}
            sx={{
                overflow: 'auto',
                height: '100%',
            }}
            className={className}
        >
            {children}
            {hasMore && (
                <Box
                    role="status"
                    aria-live="polite"
                    aria-label={loadingLabel}
                    sx={{ display: "flex", justifyContent: "center", p: 2 }}
                >
                    {loader}
                </Box>
            )}
        </Box>
    );
});

InfiniteScroll.displayName = 'InfiniteScroll';

export default InfiniteScroll;
