import type { ReactNode } from 'react';
import styles from './Notice.module.css';

export type NoticeTone = 'error' | 'warn' | 'ok' | 'info';

const SYMBOL: Record<NoticeTone, string> = {
  error: '✕',
  warn: '▲',
  ok: '✓',
  info: '●',
};

type Props = {
  tone: NoticeTone;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
};

/**
 * Notice of the design system. An error is announced at once (role alert),
 * the other tones politely (role status). The symbol repeats the tone, so
 * the meaning never rests on the colour alone.
 */
export function Notice({ tone, title, children, actions }: Props) {
  return (
    <div
      className={`${styles.notice} ${styles[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true">{SYMBOL[tone]}</span>
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        {children !== undefined && (
          <span className={styles.body}>{children}</span>
        )}
        {actions !== undefined && (
          <div className={styles.actions}>{actions}</div>
        )}
      </div>
    </div>
  );
}
