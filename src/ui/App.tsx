import { useTranslation } from 'react-i18next';

// Scaffold only: the app shell follows in S16.
export function App() {
  const { t } = useTranslation();
  return <h1>{t('appName')}</h1>;
}
