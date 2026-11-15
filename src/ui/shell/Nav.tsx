import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { AREAS } from './areas';
import styles from './Nav.module.css';
import { NavIcon } from './NavIcons';

/**
 * Navigation of the five areas: the sidebar from 900 px, the bottom bar
 * below (8.8). The active area gets aria-current="page", also on its
 * sub-routes such as #/kandidaten/:id.
 */
export function Nav({ variant }: { variant: 'side' | 'bottom' }) {
  const { t } = useTranslation();
  return (
    <nav
      className={`${styles.nav} ${styles[variant]}`}
      aria-label={t('nav.label')}
    >
      {AREAS.map((area) => (
        <NavLink key={area} to={`/${area}`} className={styles.item}>
          <NavIcon area={area} className={styles.icon} />
          {variant === 'bottom' && area === 'szenarien'
            ? t('nav.szenarienShort')
            : t(`nav.${area}`)}
        </NavLink>
      ))}
    </nav>
  );
}
