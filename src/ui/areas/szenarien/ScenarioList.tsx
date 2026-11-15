import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scenario } from '../../../domain';
import {
  activeScenarioSet,
  createScenario,
  deleteScenario,
  duplicateScenario,
  renameScenario,
  useAppDispatch,
  useAppSelector,
  selectScenarios,
} from '../../../state';
import {
  Button,
  Card,
  ConfirmDialog,
  Notice,
  TextField,
} from '../../components';
import styles from './ScenarioList.module.css';

type Props = {
  compared: string[];
  onCompareChange: (ids: string[]) => void;
};

/**
 * The scenarios as cards (boards D7, M10; states Z01, Z19): activate, rename,
 * duplicate, delete with confirmation, and the choice for the comparison.
 */
export function ScenarioList({ compared, onCompareChange }: Props) {
  const { t } = useTranslation('szenarien');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const scenarios = useAppSelector(selectScenarios);
  const activeId = useAppSelector((state) => state.scenario.activeId);
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Scenario | null>(null);
  const [blocked, setBlocked] = useState(false);
  // The scenario whose rename form was open: focus goes back to its button.
  const renamedId = useRef<string | null>(null);
  const renamingId = renaming?.id ?? null;
  useEffect(() => {
    if (renamingId) {
      renamedId.current = renamingId;
      document.getElementById(`rename-field-${renamingId}`)?.focus();
    } else if (renamedId.current) {
      document.getElementById(`rename-button-${renamedId.current}`)?.focus();
      renamedId.current = null;
    }
  }, [renamingId]);

  const toggle = (id: string) =>
    onCompareChange(
      compared.includes(id)
        ? compared.filter((other) => other !== id)
        : [...compared, id],
    );

  const commitRename = () => {
    if (!renaming) return;
    const result = dispatch(renameScenario(renaming.id, renaming.text));
    if (result === 'ok' || result === 'unknown') {
      setRenaming(null);
      setRenameError(null);
    } else {
      setRenameError(
        result === 'empty' ? t('list.nameEmpty') : t('list.nameTaken'),
      );
    }
  };

  return (
    <section className="stack" aria-labelledby="scenario-list-title">
      <div className="spread">
        <h2 className="h-heading" id="scenario-list-title">
          {t('list.title')}
        </h2>
        <span className="row-wrap">
          <Button
            variant="primary"
            onClick={() => dispatch(createScenario({ name: t('new') }))}
          >
            {t('list.newEmpty')}
          </Button>
          <Button
            onClick={() =>
              dispatch(createScenario({ name: t('new'), copyOfActive: true }))
            }
            disabled={!activeId}
          >
            {t('list.newCopy')}
          </Button>
        </span>
      </div>
      <p className="t-sm muted">{t('list.hint')}</p>
      {blocked && (
        <Notice tone="error" title={t('list.storageBlockedTitle')}>
          {t('list.storageBlockedBody')}
        </Notice>
      )}
      <ul className={`stack ${styles.list}`}>
        {scenarios.map((scenario) => {
          const isActive = scenario.id === activeId;
          const isRenaming = renaming?.id === scenario.id;
          return (
            <li key={scenario.id}>
              <Card>
                <div className="stack-sm">
                  {isRenaming ? (
                    <form
                      className="stack-sm"
                      onSubmit={(event) => {
                        event.preventDefault();
                        commitRename();
                      }}
                    >
                      <TextField
                        id={`rename-field-${scenario.id}`}
                        label={t('list.nameLabel')}
                        value={renaming.text}
                        error={renameError}
                        onChange={(text) => {
                          setRenaming({ id: scenario.id, text });
                          setRenameError(null);
                        }}
                      />
                      <span className="row-wrap">
                        <Button variant="primary" type="submit">
                          {c('actions.save')}
                        </Button>
                        <Button
                          onClick={() => {
                            setRenaming(null);
                            setRenameError(null);
                          }}
                        >
                          {c('actions.cancel')}
                        </Button>
                      </span>
                    </form>
                  ) : (
                    <div className="spread">
                      <h3 className="h-heading">
                        {scenario.name}
                        {isActive && (
                          <span className="t-sm muted">
                            {' '}
                            · {t('list.active')}
                          </span>
                        )}
                      </h3>
                    </div>
                  )}
                  <p className="t-sm muted">
                    {t('list.metaCandidates', {
                      count: scenario.candidates.length,
                    })}
                  </p>
                  <label className="row-wrap t-sm">
                    <input
                      type="checkbox"
                      checked={compared.includes(scenario.id)}
                      onChange={() => toggle(scenario.id)}
                    />
                    {t('list.compareCheckbox', { name: scenario.name })}
                  </label>
                  <span className="row-wrap">
                    {!isActive && (
                      <Button
                        aria-label={t('list.activateLabel', {
                          name: scenario.name,
                        })}
                        onClick={() => dispatch(activeScenarioSet(scenario.id))}
                      >
                        {t('list.activate')}
                      </Button>
                    )}
                    <Button
                      id={`rename-button-${scenario.id}`}
                      aria-label={t('list.renameLabel', {
                        name: scenario.name,
                      })}
                      onClick={() => {
                        setRenaming({ id: scenario.id, text: scenario.name });
                        setRenameError(null);
                      }}
                    >
                      {c('actions.rename')}
                    </Button>
                    <Button
                      aria-label={t('list.duplicateLabel', {
                        name: scenario.name,
                      })}
                      onClick={() =>
                        dispatch(
                          duplicateScenario(
                            scenario.id,
                            t('list.copyName', { name: scenario.name }),
                          ),
                        )
                      }
                    >
                      {c('actions.duplicate')}
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={t('list.deleteLabel', {
                        name: scenario.name,
                      })}
                      onClick={() => setDeleting(scenario)}
                    >
                      {c('actions.delete')}
                    </Button>
                  </span>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        danger
        title={c('dialog.deleteScenarioTitle', { name: deleting?.name ?? '' })}
        confirmLabel={c('actions.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (!target) return;
          void dispatch(deleteScenario(target.id, t('templateName'))).then(
            // A full storage has its own notice in the frame.
            (result) =>
              setBlocked(result === 'readOnly' || result === 'closed'),
          );
        }}
      >
        {c('dialog.deleteScenarioBody')}
      </ConfirmDialog>
    </section>
  );
}
