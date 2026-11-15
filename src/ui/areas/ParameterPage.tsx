import { useTranslation } from 'react-i18next';
import { AreaHead } from './AreaHead';

// Frame only: S17 builds the parameters.
export function ParameterPage() {
  const { t } = useTranslation('parameter');
  return <AreaHead title={t('title')} intro={t('intro')} />;
}
