import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  comparisonCleared,
  compareScenarios,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import { AreaHead } from './AreaHead';
import { ExportImport } from './szenarien/ExportImport';
import { ExportReminder } from './szenarien/ExportReminder';
import { ScenarioComparison } from './szenarien/ScenarioComparison';
import { ScenarioList } from './szenarien/ScenarioList';

// #/szenarien: the scenario list, the comparison, export and import (S22).
export function SzenarienPage() {
  const { t } = useTranslation('szenarien');
  const dispatch = useAppDispatch();
  const known = useAppSelector((state) => state.scenario.byId);
  const [chosen, setChosen] = useState<string[]>([]);
  // Only scenarios that still exist can be compared.
  const compared = chosen.filter((id) => known[id]);
  const key = compared.join('|');

  useEffect(() => {
    const ids = key === '' ? [] : key.split('|');
    if (ids.length < 2) dispatch(comparisonCleared());
    else void dispatch(compareScenarios(ids));
  }, [dispatch, key]);

  return (
    <>
      <AreaHead title={t('title')} intro={t('intro')} />
      <ExportReminder />
      <ScenarioList compared={compared} onCompareChange={setChosen} />
      <section className="stack" aria-labelledby="compare-title">
        <h2 className="h-heading" id="compare-title">
          {t('compare.title')}
        </h2>
        <ScenarioComparison ids={compared} />
      </section>
      <ExportImport />
    </>
  );
}
