import { useTranslation } from 'react-i18next';

/** The first characters of a commit id are enough to tell two builds apart. */
const SHORT_BUILD = 7;

/**
 * The build id the page was built with: the meta tag the build writes
 * (build/html.ts). `local` (a build on a developer machine) and a missing tag
 * (development server, tests) say nothing, so they are not shown.
 */
export function buildIdOfPage(): string | null {
  const id = document
    .querySelector('meta[name="build-id"]')
    ?.getAttribute('content');
  if (!id || id === 'local') return null;
  return id.slice(0, SHORT_BUILD);
}

/** The release and build the app runs, for a bug report or to tell a phone's version. */
export function AppVersion() {
  const { t } = useTranslation('szenarien');
  const build = buildIdOfPage();
  return (
    <p className="muted" data-testid="app-version">
      {build
        ? t('versionBuild', { version: __APP_VERSION__, build })
        : t('version', { version: __APP_VERSION__ })}
    </p>
  );
}
