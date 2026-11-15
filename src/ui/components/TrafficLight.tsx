import type { ReactNode } from 'react';
import styles from './TrafficLight.module.css';

export type TrafficLightLevel = 'green' | 'yellow' | 'red' | 'none';

const SYMBOL: Record<TrafficLightLevel, string | null> = {
  green: '✓',
  yellow: '▲',
  red: '✕',
  none: null,
};

type Props = {
  level: TrafficLightLevel;
  /** Replaces the level's symbol, e.g. "↻" for "wird aktualisiert". */
  symbol?: string;
  /** The word or number; always shown, the colour alone never carries meaning (8.8). */
  children: ReactNode;
};

/** Traffic light badge: colour, symbol and text together. */
export function TrafficLight({ level, symbol, children }: Props) {
  const shown = symbol ?? SYMBOL[level];
  return (
    <span className={`${styles.light} ${styles[level]}`}>
      {shown !== null && (
        <span className={styles.symbol} aria-hidden="true">
          {shown}
        </span>
      )}
      {children}
    </span>
  );
}
