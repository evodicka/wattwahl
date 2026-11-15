import { useTranslation } from 'react-i18next';
import { AreaHead } from './AreaHead';

// Frame only: S22 builds scenarios, comparison, export and import.
export function SzenarienPage() {
  const { t } = useTranslation('szenarien');
  return <AreaHead title={t('title')} intro={t('intro')} />;
}
