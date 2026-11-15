import { useTranslation } from 'react-i18next';
import { Notice } from '../components';

/** Shown instead of the app when the stored data cannot be read at all (6.2). */
export function StartFailed() {
  const { t } = useTranslation();
  return (
    <main className="app-main">
      <Notice tone="error" title={t('notice.startFailedTitle')}>
        {t('notice.startFailedBody')}
      </Notice>
    </main>
  );
}
