import { selectActiveScenario, useAppSelector } from '../../state';

/**
 * Hidden measuring hooks for the end-to-end tests (S24: Q1, Q2, Q5). They
 * live in the shell, so every area has them, not only the result area. The
 * hash and the time are set only while the result belongs to the current
 * input; nothing here is shown or read aloud.
 */
export function ResultProbe() {
  const latest = useAppSelector((state) => state.result.latest);
  const status = useAppSelector((state) => state.result.status);
  const computeMs = useAppSelector((state) => state.result.computeMs);
  const active = useAppSelector(selectActiveScenario);

  const updating =
    status === 'computing' ||
    status === 'stale' ||
    (latest !== null && latest.scenarioId !== active?.id);
  const current = !updating && status === 'idle' && latest !== null;

  return (
    <span
      hidden
      data-testid="result-probe"
      data-updating={updating}
      data-scenario-id={current ? latest.scenarioId : undefined}
      data-result-hash={current ? latest.hash : undefined}
      data-compute-ms={current && computeMs !== null ? computeMs : undefined}
    />
  );
}
