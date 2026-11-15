import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  comparisonCleared,
  compareScenarios,
  useAppDispatch,
  useAppSelector,
} from '../../state';
import { AreaHead } from './AreaHead';
import { ExportImport } from './szenarien/ExportImport';
import { ExportReminder } from '../shell/ExportReminder';
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

  // The scenario objects the comparison was last started with: an import that
  // replaces them under the same ids must compute the comparison again.
  const started = useRef<unknown[]>([]);
  useEffect(() => {
    const ids = key === '' ? [] : key.split('|');
    const objects = ids.map((id) => known[id]);
    const same =
      objects.length === started.current.length &&
      objects.every((object, index) => object === started.current[index]);
    if (same) return;
    started.current = objects;
    if (ids.length < 2) dispatch(comparisonCleared());
    else void dispatch(compareScenarios(ids));
  }, [dispatch, key, known]);

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
