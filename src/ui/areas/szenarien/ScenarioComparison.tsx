import { useTranslation } from 'react-i18next';
import { formatEuro, formatKm } from '../../../i18n';
import { useAppSelector } from '../../../state';
import { DataTable, Notice } from '../../components';
import { ChartSuspense, CostBars } from '../../charts/lazy';
import type { CostBarRow } from '../../charts/CostBars';
import {
  comparisonRows,
  type ComparedScenario,
} from '../../forms/comparisonView';

/**
 * The comparison of the chosen scenarios in the price case "Mittel" (board
 * D7, spec "Szenariovergleich"): bars per offer and scenario, and the same
 * values as a table with the difference.
 */
export function ScenarioComparison({ ids }: { ids: string[] }) {
  const { t } = useTranslation('szenarien');
  const byId = useAppSelector((state) => state.scenario.byId);
  const comparison = useAppSelector((state) => state.result.comparison);

  if (ids.length < 2) {
    return <p className="t-sm muted">{t('compare.needTwo')}</p>;
  }
  if (!comparison || comparison.status === 'loading') {
    return (
      <p className="t-sm muted" role="status">
        {t('compare.loading')}
      </p>
    );
  }
  if (comparison.status === 'error') {
    return (
      <Notice tone="error" title={t('compare.errorTitle')}>
        {t('compare.errorBody')}
      </Notice>
    );
  }

  const compared: ComparedScenario[] = comparison.scenarioIds.flatMap((id) => {
    const scenario = byId[id];
    return scenario ? [{ scenario, results: comparison.results[id] }] : [];
  });
  const rows = comparisonRows(compared);
  const offerName = (name: string, tier: number | null) =>
    `${name} · ${tier === null ? t('compare.purchase') : t('compare.lease', { km: formatKm(tier) })}`;

  const bars: CostBarRow[] = rows.flatMap((row) =>
    compared.flatMap(({ scenario }, column) => {
      const cell = row.cells[column];
      return cell
        ? [
            {
              id: `${row.key}@${scenario.id}`,
              label: `${offerName(row.candidateName, row.leaseTierKm)} · ${scenario.name}`,
              costs: cell.costs,
              range: null,
            },
          ]
        : [];
    }),
  );

  return (
    <div className="stack">
      <p className="t-sm muted">{t('compare.basis')}</p>
      {bars.length > 0 && (
        <figure className="stack-sm">
          <figcaption className="t-sm muted">
            {t('compare.chartLabel')}
          </figcaption>
          <ChartSuspense>
            <CostBars rows={bars} />
          </ChartSuspense>
        </figure>
      )}
      <details>
        <summary>{t('compare.asTable')}</summary>
        <DataTable caption={t('compare.subtitle')}>
          <>
            <thead>
              <tr>
                <th scope="col">{t('compare.offer')}</th>
                {compared.map(({ scenario }) => (
                  <th scope="col" key={scenario.id}>
                    {t('compare.scenarioCost', { name: scenario.name })}
                  </th>
                ))}
                <th scope="col">{t('compare.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    {offerName(row.candidateName, row.leaseTierKm)}
                  </th>
                  {row.cells.map((cell, column) => (
                    <td key={compared[column]?.scenario.id ?? column}>
                      {cell ? formatEuro(cell.total) : t('compare.missing')}
                    </td>
                  ))}
                  <td>
                    {row.difference === null
                      ? t('compare.missing')
                      : formatEuro(row.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </>
        </DataTable>
      </details>
    </div>
  );
}
