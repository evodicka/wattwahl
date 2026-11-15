import { useTranslation } from 'react-i18next';
import { AreaHead } from './AreaHead';

// Frame only: S17 builds the forms.
export function FahrprofilPage() {
  const { t } = useTranslation('fahrprofil');
  return <AreaHead title={t('title')} intro={t('intro')} />;
}
