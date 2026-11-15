import { useTranslation } from 'react-i18next';
import { AreaHead } from './AreaHead';

// Frame only: S18 builds the list (#/kandidaten) and the form (#/kandidaten/:id).
export function KandidatenPage() {
  const { t } = useTranslation('kandidaten');
  return <AreaHead title={t('title')} />;
}
