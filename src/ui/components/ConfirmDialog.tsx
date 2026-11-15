import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

type Props = {
  open: boolean;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  /** Deleting and replacing confirm with the danger button. */
  danger?: boolean;
  onConfirm: () => void;
  /** Also on Escape. */
  onCancel: () => void;
};

/**
 * Confirmation dialog (Z19). The native modal dialog keeps the focus inside
 * and returns it to the opener when it closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.content}>
        <h2 className="h-heading" id={titleId}>
          {title}
        </h2>
        {children !== undefined && <p className="t-sm">{children}</p>}
        <div className="row-wrap">
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button onClick={onCancel}>{t('actions.cancel')}</Button>
        </div>
      </div>
    </dialog>
  );
}
