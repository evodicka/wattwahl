import type { ComponentProps } from 'react';
import styles from './Card.module.css';

type Props = ComponentProps<'section'> & { muted?: boolean };

/** Card of the design system; `muted` for the subdued variant. */
export function Card({ muted = false, className, ...props }: Props) {
  const classes = [styles.card, muted ? styles.muted : undefined, className];
  return <section className={classes.filter(Boolean).join(' ')} {...props} />;
}
