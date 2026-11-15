import { useTranslation } from 'react-i18next';
import { StatusLine } from '../shell/StatusLine';
import { AreaHead } from './AreaHead';

// Frame only: S19 to S21 build the table, charts, Rechenweg and price slider
// (#/ergebnis and #/ergebnis/:offerId). Every result view names what it shows.
export function ErgebnisPage() {
  const { t } = useTranslation('ergebnis');
  return (
    <>
      <AreaHead title={t('title')} />
      <StatusLine />
    </>
  );
}
