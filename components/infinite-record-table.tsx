import { useRef, useState, type ReactNode } from "react";

export const RECORD_BATCH_SIZE = 150;

// Project schedules are stored together in project.data. Reveal the loaded rows
// in batches without fetching or replacing the project while cells are edited.
export function InfiniteRecordTable<T>({
  rows,
  className,
  label,
  describedBy,
  children,
}: {
  rows: T[];
  className: string;
  label: string;
  describedBy?: string;
  children: (visibleRows: T[]) => ReactNode;
}) {
  const [limit, setLimit] = useState(RECORD_BATCH_SIZE);
  const lastScrollTop = useRef(0);
  const count = Math.min(limit, rows.length);
  const hasMore = count < rows.length;

  return <>
    <div
      className={`${className} infinite-record-scroll`}
      role="region"
      tabIndex={0}
      aria-label={label}
      aria-describedby={describedBy}
      onScroll={(event) => {
        const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
        const scrollingDown = scrollTop > lastScrollTop.current;
        lastScrollTop.current = scrollTop;
        if (scrollingDown && hasMore && scrollHeight - clientHeight - scrollTop <= 100) {
          // Use the rendered limit so multiple events before the next render
          // cannot skip batches. Horizontal scrolling never loads more rows.
          setLimit(limit + RECORD_BATCH_SIZE);
        }
      }}
    >
      {children(rows.slice(0, count))}
    </div>
    <div className="record-scroll-status" role="status" aria-live="polite" aria-atomic="true">
      Showing {count} of {rows.length} records{hasMore ? " · Scroll down for more" : ""}
    </div>
  </>;
}
