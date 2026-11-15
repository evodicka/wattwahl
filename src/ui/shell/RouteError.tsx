import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Notice } from '../components';

/**
 * Error page of the router: replaces React Router's default screen, whose
 * English text is not in the language file. Errors of an area stay in its
 * AreaBoundary; this catches what fails around them.
 */
export function RouteError() {
  const { t } = useTranslation();
  return (
    <main className="app-main">
      <Notice
        tone="error"
        title={t('notice.pageFailedTitle')}
        actions={
          <Link className="link" to="/fahrprofil">
            {t('actions.toStart')}
          </Link>
        }
      >
        {t('notice.pageFailedBody')}
      </Notice>
    </main>
  );
}
