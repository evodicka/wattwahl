import { Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Button, Notice } from '../components';
import type { Area } from './areas';

type Props = { area: Area; children: ReactNode };

/**
 * Error boundary of one area (8.10, Z05): a failing view shows a notice with
 * "Erneut versuchen", the frame and the other areas stay usable. A change of
 * route starts the area afresh.
 */
export function AreaBoundary({ area, children }: Props) {
  const { pathname } = useLocation();
  return (
    <Boundary key={pathname} area={area}>
      {children}
    </Boundary>
  );
}

class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <AreaFailed
        area={this.props.area}
        onRetry={() => this.setState({ failed: false })}
      />
    );
  }
}

function AreaFailed({ area, onRetry }: { area: Area; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Notice
      tone="error"
      title={t('notice.areaFailedTitle', { area: t(`nav.${area}`) })}
      actions={<Button onClick={onRetry}>{t('actions.retry')}</Button>}
    >
      {t('notice.areaFailedBody')}
    </Notice>
  );
}
