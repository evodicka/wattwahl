import type { ReactNode } from 'react';
import styles from './Tile.module.css';

type Props = {
  label: ReactNode;
  /** The big number. */
  value: ReactNode;
  children?: ReactNode;
};

/** Tile of the design system: a label, one big number and a line of context. */
export function Tile({ label, value, children }: Props) {
  return (
    <div className={styles.tile}>
      <span className="t-label">{label}</span>
      <span className={styles.value}>{value}</span>
      {children}
    </div>
  );
}
