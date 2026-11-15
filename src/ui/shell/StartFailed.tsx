import { useTranslation } from 'react-i18next';
import { Notice } from '../components';

/** Why the app could not start (6.2). */
export type StartFailure =
  /** The stored data cannot be read at all, e.g. in a private window. */
  | 'storage'
  /** Anything else; a reload may help, the data stays. */
  | 'other';

/** Shown instead of the app when it cannot start. */
export function StartFailed({ cause }: { cause: StartFailure }) {
  const { t } = useTranslation();
  return (
    <main className="app-main">
      {cause === 'storage' ? (
        <Notice tone="error" title={t('notice.startFailedTitle')}>
          {t('notice.startFailedBody')}
        </Notice>
      ) : (
        <Notice tone="error" title={t('notice.startErrorTitle')}>
          {t('notice.startErrorBody')}
        </Notice>
      )}
    </main>
  );
}
