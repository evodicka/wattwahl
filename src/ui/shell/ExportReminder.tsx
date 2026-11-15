import { useTranslation } from 'react-i18next';
import {
  exportReminderDismissed,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import { Button, Notice } from '../components';

/**
 * The export reminder (Z10, spec "Export-Erinnerung"): it names the age of the
 * last export, and can be closed until the app is started again.
 */
export function ExportReminder({
  exportAction,
}: {
  exportAction?: () => void;
}) {
  const { t } = useTranslation('szenarien');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.ui.exportReminder);
  const days = useAppSelector((s) => s.ui.exportAgeDays);
  if (state !== 'due') return null;
  return (
    <Notice
      tone="warn"
      title={
        days === null
          ? t('export.never')
          : t('export.reminderTitle', { count: days })
      }
      actions={
        <>
          {exportAction && (
            <Button variant="primary" onClick={exportAction}>
              {c('actions.exportNow')}
            </Button>
          )}
          <Button onClick={() => dispatch(exportReminderDismissed())}>
            {c('actions.later')}
          </Button>
        </>
      }
    >
      {t('export.reminderBody')}
    </Notice>
  );
}
