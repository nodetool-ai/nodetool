import React, { useEffect, useCallback, useRef, ReactNode } from 'react';

interface InfiniteScrollProps {
    next: () => void | Promise<unknown>;
    hasMore: boolean;
    loader: ReactNode;
    children: ReactNode;
    threshold?: number;
    className?: string;
}

const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
    next,
    hasMore,
    loader,
    children,
    threshold = 100,
    className = '',
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current || !hasMore) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        if (scrollHeight - scrollTop - clientHeight < threshold) {
            next();
        }
    }, [hasMore, next, threshold]);

    useEffect(() => {
        const scrollContainer = scrollRef.current;
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll);
            return () => scrollContainer.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    return (
        <div
            ref={scrollRef}
            style={{ overflow: "scroll", height: "100%" }}
            className={className}
        >
            {children}
            {hasMore && loader}
        </div >
    );
};

export default InfiniteScroll;