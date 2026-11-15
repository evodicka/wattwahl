import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { noticeDismissed, useAppDispatch, useAppSelector } from '../../state';
import { Button, Notice } from '../components';

/**
 * Notices of the frame (briefing §3): full storage (Z07), a newer tab, a
 * database of a newer app and refused persistent storage (8.2, 8.10).
 */
export function FrameNotices({
  reload = () => window.location.reload(),
}: {
  /** Injected in tests; jsdom cannot reload. */
  reload?: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const notices = useAppSelector((state) => state.ui.notices);

  return (
    <>
      {notices.quotaExceeded && (
        <Notice
          tone="error"
          title={t('notice.storageFullTitle')}
          actions={
            <Button
              variant="primary"
              onClick={() => void navigate('/szenarien')}
            >
              {t('actions.exportNow')}
            </Button>
          }
        >
          {t('notice.storageFullBody')}
        </Notice>
      )}
      {notices.reloadRequired && (
        <Notice
          tone="warn"
          title={t('notice.reloadTitle')}
          actions={
            <Button variant="primary" onClick={reload}>
              {t('actions.reload')}
            </Button>
          }
        >
          {t('notice.reloadBody')}
        </Notice>
      )}
      {notices.databaseReadOnly && (
        <Notice tone="warn" title={t('notice.readOnlyTitle')}>
          {t('notice.readOnlyBody')}
        </Notice>
      )}
      {notices.persistenceDenied && (
        <Notice
          tone="info"
          title={t('notice.storageDeniedTitle')}
          actions={
            <Button
              onClick={() => dispatch(noticeDismissed('persistenceDenied'))}
            >
              {t('actions.close')}
            </Button>
          }
        >
          {t('notice.storageDenied')}
        </Notice>
      )}
    </>
  );
}
