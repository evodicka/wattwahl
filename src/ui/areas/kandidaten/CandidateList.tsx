import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Candidate } from '../../../domain';
import {
  addCandidate,
  deleteCandidate,
  duplicateCandidate,
  selectActiveScenario,
  useAppDispatch,
  useAppSelector,
} from '../../../state';
import { Button, ConfirmDialog, EmptyState } from '../../components';
import { candidateStatus } from '../../forms/candidateStatus';
import { AreaHead } from '../AreaHead';
import { CandidateCard } from './CandidateCard';

/** The candidates of the active scenario as cards (boards D2, M2; states Z01 to Z03, Z19). */
export function CandidateList() {
  const { t } = useTranslation('kandidaten');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const scenario = useAppSelector(selectActiveScenario);
  const latest = useAppSelector((state) => state.result.latest);
  const [deleting, setDeleting] = useState<Candidate | null>(null);
  if (!scenario) return <AreaHead title={t('title')} />;

  const results =
    latest?.scenarioId === scenario.id ? latest.results : undefined;
  const leases = scenario.candidates.reduce(
    (n, cand) => n + cand.leaseTiers.length,
    0,
  );
  const summary = [
    t('summary.candidates', { count: scenario.candidates.length }),
    t('summary.leases', { count: leases }),
    t('summary.live'),
  ].join(c('separator'));

  const create = () => {
    const id = dispatch(addCandidate());
    if (id) void navigate(`/kandidaten/${id}`);
  };

  return (
    <>
      <div className="spread">
        <AreaHead title={t('title')} intro={summary} />
        {scenario.candidates.length > 0 && (
          <Button variant="primary" onClick={create}>
            {t('new')}
          </Button>
        )}
      </div>
      {scenario.candidates.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          actions={
            <Button variant="primary" onClick={create}>
              {t('empty.action')}
            </Button>
          }
        >
          {t('empty.body')}
        </EmptyState>
      ) : (
        <>
          <div className="cols2">
            {scenario.candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                scenario={scenario}
                status={candidateStatus(candidate, index, results)}
                onEdit={() => void navigate(`/kandidaten/${candidate.id}`)}
                onDuplicate={() =>
                  dispatch(
                    duplicateCandidate(
                      candidate.id,
                      t('card.copyName', {
                        name: candidate.name.trim() || t('new'),
                      }),
                    ),
                  )
                }
                onDelete={() => setDeleting(candidate)}
              />
            ))}
          </div>
          <p className="t-sm muted">{t('listHint')}</p>
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        danger
        title={c('dialog.deleteCandidateTitle', {
          name: deleting?.name.trim() || t('new'),
        })}
        confirmLabel={c('actions.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) dispatch(deleteCandidate(deleting.id));
          setDeleting(null);
        }}
      >
        {c('dialog.deleteCandidateBody')}
      </ConfirmDialog>
    </>
  );
}
