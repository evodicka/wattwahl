import { lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Every chart is its own chunk, loaded when a view shows it, so that the
// chart library is not in the start bundle (architecture 8.9, ADR-11).

export const CostBars = lazy(() => import('./CostBars'));
export const ReserveHeatmap = lazy(() => import('./ReserveHeatmap'));
export const AssignmentGrid = lazy(() => import('./AssignmentGrid'));

/** Says that a chart is loading until its chunk is there. */
export function ChartSuspense({ children }: { children: ReactNode }) {
  const { t } = useTranslation('ergebnis');
  return (
    <Suspense
      fallback={
        <p className="t-sm muted" role="status">
          {t('chartLoading')}
        </p>
      }
    >
      {children}
    </Suspense>
  );
}
