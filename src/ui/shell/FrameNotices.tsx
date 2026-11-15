import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { isIosBrowserTab, useUpdatePrompt } from '../../pwa';
import {
  noticeDismissed,
  saveBeforeUpdate,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import { Button, Notice } from '../components';
import { ExportReminder } from './ExportReminder';

/**
 * Notices of the frame (briefing §3): full storage (Z07), a newer tab, a
 * database of a newer app, refused persistent storage (8.2, 8.10), a new
 * version (Z08) and the first start with the iOS install hint (Z18, Z09).
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
  const { pathname } = useLocation();
  const notices = useAppSelector((state) => state.ui.notices);
  const { updateAvailable, update, dismiss } = useUpdatePrompt();
  const [updateBlocked, setUpdateBlocked] = useState(false);

  // 6.4, step 3: save at once, then the new version takes over and the page reloads.
  const runUpdate = async () => {
    setUpdateBlocked(false);
    if (await dispatch(saveBeforeUpdate())) await update();
    else setUpdateBlocked(true);
  };

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
      {pathname !== '/szenarien' && (
        <ExportReminder exportAction={() => void navigate('/szenarien')} />
      )}
      {updateAvailable && (
        <Notice
          tone={updateBlocked ? 'warn' : 'info'}
          title={t('notice.updateTitle')}
          actions={
            <>
              <Button variant="primary" onClick={() => void runUpdate()}>
                {t('actions.update')}
              </Button>
              {updateBlocked && (
                <Button onClick={() => void navigate('/szenarien')}>
                  {t('actions.exportNow')}
                </Button>
              )}
              <Button
                onClick={() => {
                  setUpdateBlocked(false);
                  dismiss();
                }}
              >
                {t('actions.later')}
              </Button>
            </>
          }
        >
          {updateBlocked
            ? t('notice.updateBlockedBody')
            : t('notice.updateBody')}
        </Notice>
      )}
      {notices.firstStart && (
        <Notice
          tone="info"
          title={t('notice.welcomeTitle')}
          actions={
            <Button onClick={() => dispatch(noticeDismissed('firstStart'))}>
              {t('actions.understood')}
            </Button>
          }
        >
          {isIosBrowserTab()
            ? t('notice.iosInstallBody')
            : t('notice.welcomeBody')}
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
