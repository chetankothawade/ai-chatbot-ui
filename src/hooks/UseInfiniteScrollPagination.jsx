import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Cursor-based infinite scroll pagination hook.
 * `onLoadPage` must return `{ nextCursor }`.
 */
const useInfiniteScrollPagination = ({
  containerRef,
  onLoadPage,
  disabled = false,
  threshold = 50,
  initialHasMore = true,
  itemsLength = 0,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const appendingRef = useRef(false);

  // Load a page of items. If `append` is true, it will append to the existing list; otherwise, it will replace it.
  const loadPage = useCallback(
    async ({ cursor = null, append = false } = {}) => {
      if (append && (!cursor || appendingRef.current)) return false;

      if (append) {
        appendingRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await onLoadPage({ cursor, append });
        const upcomingCursor = result?.nextCursor ?? null;
        setNextCursor(upcomingCursor);
        setHasMore(Boolean(upcomingCursor));
        return true;
      } catch {
        if (!append) {
          setNextCursor(null);
          setHasMore(false);
        }
        return false;
      } finally {
        if (append) appendingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [onLoadPage]
  );

  const loadFirstPage = useCallback(() => loadPage({ cursor: null, append: false }), [loadPage]);

  const loadNextPage = useCallback(() => {
    if (!nextCursor) return Promise.resolve(false);
    return loadPage({ cursor: nextCursor, append: true });
  }, [nextCursor, loadPage]);

  const handleScroll = useCallback(() => {
    if (disabled) return;
    const el = containerRef?.current;
    if (!el || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      loadNextPage();
    }
  }, [disabled, containerRef, loadingMore, hasMore, threshold, loadNextPage]);

  useEffect(() => {
    if (disabled) return;
    const el = containerRef?.current;
    if (!el || loading || loadingMore || !hasMore || !nextCursor) return;

    if (el.scrollHeight <= el.clientHeight) {
      loadNextPage();
    }
  }, [
    disabled,
    containerRef,
    loading,
    loadingMore,
    hasMore,
    nextCursor,
    loadNextPage,
    itemsLength,
  ]);

  return {
    loading,
    loadingMore,
    hasMore,
    nextCursor,
    loadFirstPage,
    loadNextPage,
    handleScroll,
  };
};

export default useInfiniteScrollPagination;
