import type { ComponentProps } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'normal' | 'primary' | 'quiet' | 'danger';

type Props = ComponentProps<'button'> & { variant?: ButtonVariant };

/** Button of the design system: primary, normal, quiet, danger, disabled. */
export function Button({
  variant = 'normal',
  className,
  type = 'button',
  ...props
}: Props) {
  const classes = [
    styles.button,
    variant === 'normal' ? undefined : styles[variant],
    className,
  ];
  return (
    <button
      type={type}
      className={classes.filter(Boolean).join(' ')}
      {...props}
    />
  );
}
