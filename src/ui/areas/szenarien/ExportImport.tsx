import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { ImportError, ImportMode } from '../../../state';
import {
  exportScenarios,
  importErrorCleared,
  importFile,
  selectActiveScenario,
  selectScenarios,
  useAppDispatch,
  useAppSelector,
} from '../../../state';
import { formatDate } from '../../../i18n';
import { Button, Card, ConfirmDialog, Notice } from '../../components';
import { labelOfPath } from '../../forms/fieldLabels';

/** Hands the file to the browser as a download. */
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Where an import error points: the field label of its path, or the file itself. */
function locationOf(error: ImportError, t: TFunction<'szenarien'>): string {
  if (!error.path) return t('import.locationFile');
  const match = /^scenarios\[(\d+)\]\.?(.*)$/.exec(error.path);
  if (!match) return t('import.locationFile');
  const rest = match[2] ?? '';
  const nth = Number(match[1]) + 1;
  return rest
    ? `${t('import.locationScenario', { nth })}, ${labelOfPath(rest)}`
    : t('import.locationScenario', { nth });
}

/** Export (Z10) and import (Z11, Z12) of the scenarios as a file (spec 8.3). */
export function ExportImport() {
  const { t } = useTranslation('szenarien');
  const { t: c } = useTranslation();
  const dispatch = useAppDispatch();
  const scenarios = useAppSelector(selectScenarios);
  const active = useAppSelector(selectActiveScenario);
  const lastExportAt = useAppSelector((s) => s.scenario.settings.lastExportAt);
  const ageDays = useAppSelector((s) => s.ui.exportAgeDays);
  const importError = useAppSelector((s) => s.ui.notices.importError);
  const [mode, setMode] = useState<ImportMode>('add');
  const [exported, setExported] = useState<{
    name: string;
    skipped: number;
  } | null>(null);
  const [exportFailed, setExportFailed] = useState(false);
  const [imported, setImported] = useState(false);
  const [writeBlocked, setWriteBlocked] = useState(false);
  const [importBroke, setImportBroke] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const runExport = async (ids?: string[]) => {
    setExportFailed(false);
    try {
      const file = await dispatch(exportScenarios(ids));
      download(file.fileName, file.content);
      setExported({ name: file.fileName, skipped: file.skipped.length });
    } catch {
      setExportFailed(true);
    }
  };

  const runImport = async (file: File) => {
    setImported(false);
    setWriteBlocked(false);
    setImportBroke(false);
    try {
      const result = await dispatch(importFile(file, mode));
      if (result.status === 'ok') {
        setImported(true);
      } else if (result.status === 'readOnly' || result.status === 'closed') {
        // A full storage has its own notice in the frame.
        setWriteBlocked(true);
      }
    } catch {
      setImportBroke(true);
    }
  };

  const choose = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (mode === 'replace') setPending(file);
    else void runImport(file);
  };

  const lastLine =
    lastExportAt === null
      ? t('export.never')
      : `${t('export.lastDate', { date: formatDate(lastExportAt) })}${c('separator')}${t('export.lastAgo', { count: ageDays ?? 0 })}`;

  return (
    <div className="cols2">
      <section className="stack" aria-labelledby="export-title">
        <h2 className="h-heading" id="export-title">
          {t('export.title')}
        </h2>
        <p className="t-sm muted">{t('export.intro')}</p>
        <p className="t-sm">{lastLine}</p>
        <span className="row-wrap">
          <Button
            variant="primary"
            disabled={scenarios.length === 0}
            onClick={() => void runExport()}
          >
            {t('export.all')}
          </Button>
          {active && (
            <Button onClick={() => void runExport([active.id])}>
              {t('export.one', { name: active.name })}
            </Button>
          )}
        </span>
        {exported && (
          <Notice tone="ok" title={t('export.file', { name: exported.name })}>
            {exported.skipped > 0
              ? t('export.skipped', { count: exported.skipped })
              : undefined}
          </Notice>
        )}
        {exportFailed && <Notice tone="error" title={t('export.failed')} />}
      </section>

      <section className="stack" aria-labelledby="import-title">
        <h2 className="h-heading" id="import-title">
          {t('import.title')}
        </h2>
        <p className="t-sm muted">{t('import.intro')}</p>
        <fieldset className="stack-sm">
          <legend className="t-label">{t('import.modeLegend')}</legend>
          {(['add', 'replace'] as const).map((value) => (
            <label key={value} className="row-wrap t-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value === 'add' ? t('import.modeAdd') : t('import.modeReplace')}
            </label>
          ))}
        </fieldset>
        {mode === 'replace' && (
          <Notice tone="warn" title={t('import.replaceTitle')}>
            {t('import.replaceBody', { count: scenarios.length })}
          </Notice>
        )}
        <Card muted>
          <label className="stack-sm">
            <span className="t-label">{t('import.drop')}</span>
            <input
              ref={input}
              type="file"
              accept="application/json,.json"
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </label>
        </Card>
        {importError && (
          <Notice
            tone="error"
            title={t('import.errorTitle')}
            actions={
              <Button onClick={() => dispatch(importErrorCleared())}>
                {c('actions.close')}
              </Button>
            }
          >
            {t('import.errorBody', {
              location: locationOf(importError, t),
              problem: t(`import.problem.${importError.code}`),
            })}
          </Notice>
        )}
        {importBroke && (
          <Notice tone="error" title={t('import.brokeTitle')}>
            {t('import.brokeBody')}
          </Notice>
        )}
        {writeBlocked && (
          <Notice tone="error" title={t('import.readOnlyTitle')}>
            {t('import.readOnlyBody')}
          </Notice>
        )}
        {imported && !importError && !writeBlocked && (
          <Notice tone="ok" title={t('import.done')} />
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        danger
        title={t('import.replaceTitle')}
        confirmLabel={t('import.replaceConfirm')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const file = pending;
          setPending(null);
          if (file) void runImport(file);
        }}
      >
        {t('import.replaceBody', { count: scenarios.length })}
      </ConfirmDialog>
    </div>
  );
}
