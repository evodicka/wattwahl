import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

type Props = {
  title: ReactNode;
  children?: ReactNode;
  /** First steps: buttons or links. */
  actions?: ReactNode;
};

/** Empty state (Z01): names the first steps, not just "no data". */
export function EmptyState({ title, children, actions }: Props) {
  return (
    <div className={styles.empty}>
      <h2 className="h-heading">{title}</h2>
      {children !== undefined && <p className="t-sm muted">{children}</p>}
      {actions !== undefined && <div className="row-wrap">{actions}</div>}
    </div>
  );
}
