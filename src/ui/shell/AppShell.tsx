import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useMatches } from 'react-router';
import { formatTime } from '../../i18n';
import { selectActiveScenario, useAppSelector } from '../../state';
import { isAreaHandle } from './areas';
import styles from './AppShell.module.css';
import { FrameNotices } from './FrameNotices';
import { Nav } from './Nav';
import { useTrafficLightColors } from './useTrafficLightColors';

/**
 * The frame of every area (8.8, boards D1, M1, T1 to T4): sidebar with the
 * active scenario from 900 px, header and bottom navigation below. Both
 * navigations are rendered; theme.css shows one per width.
 */
export function AppShell() {
  const { t } = useTranslation();
  const main = useRef<HTMLElement>(null);
  const active = useAppSelector(selectActiveScenario);
  const savedAt = useAppSelector((state) => state.scenario.lastSavedAt);
  const colors = useAppSelector(
    (state) => state.scenario.settings.trafficLightColors,
  );
  useTrafficLightColors(colors);

  const area = useMatches()
    .map((match) => match.handle)
    .findLast(isAreaHandle)?.area;
  const scenarioName = active?.name ?? t('frame.noScenario');

  // A route change is silent with a hash router: the title names the area,
  // and after a change of area the focus moves to the content, so keyboard
  // and screen reader users land in the new area. Not on the first render.
  const shownArea = useRef(area);
  useEffect(() => {
    document.title = area
      ? `${t(`nav.${area}`)}${t('separator')}${t('appName')}`
      : t('appName');
    if (shownArea.current !== area) main.current?.focus();
    shownArea.current = area;
  }, [area, t]);

  return (
    <div className="app-frame">
      {/* A hash link would change the route: the skip link moves the focus. */}
      <a
        className={styles.skip}
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        {t('frame.skipToContent')}
      </a>
      <aside className="app-side">
        <div className={styles.brand}>{t('appName')}</div>
        <div className={styles.scenario}>
          <span className="t-cap muted">{t('frame.scenario')}</span>
          <span className="t-label">{scenarioName}</span>
          <Link className="link" to="/szenarien">
            {t('frame.switchScenario')}
          </Link>
        </div>
        <Nav variant="side" />
      </aside>
      <header className="app-top">
        <span className="t-cap muted">
          {[
            t('status.scenario', { name: scenarioName }),
            savedAt !== null
              ? t('frame.savedAt', { time: formatTime(savedAt) })
              : null,
          ]
            .filter((part) => part !== null)
            .join(t('separator'))}
        </span>
        <span className="h-title" aria-hidden="true">
          {area ? t(`nav.${area}`) : t('appName')}
        </span>
      </header>
      <main id="content" ref={main} tabIndex={-1} className="app-main">
        <FrameNotices />
        <Outlet />
      </main>
      <div className="app-bottom">
        <Nav variant="bottom" />
      </div>
    </div>
  );
}
