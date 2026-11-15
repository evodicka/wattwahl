import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

type Props = {
  caption: ReactNode;
  /** The results are being replaced: shown dimmed, announced as busy. */
  busy?: boolean;
  /** Rows and head as `<thead>` and `<tbody>`. */
  children: ReactNode;
};

/**
 * Table of the design system in a scroll box with a fixed first column.
 * Cells with the class `num` align right. Row states are set on `tr`:
 * `aria-selected`, and the class names `muted` and `clickable` from this module
 * (`rowClass`).
 */
export function DataTable({ caption, busy = false, children }: Props) {
  return (
    <div
      className={[styles.scroll, busy ? styles.busy : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      <table className={styles.table} aria-busy={busy || undefined}>
        <caption className={styles.caption}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/** Class names for a table row: greyed out and/or clickable. */
export const rowClass = (state: { muted?: boolean; clickable?: boolean }) =>
  [
    state.muted ? styles.muted : undefined,
    state.clickable ? styles.clickable : undefined,
  ]
    .filter(Boolean)
    .join(' ') || undefined;
