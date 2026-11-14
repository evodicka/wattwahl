// S15 fixture: the type check must reject keys that are not in de.json.
// If key typing breaks, the @ts-expect-error lines become unused and
// `npm run typecheck` fails. This file is checked by tsc, not run by vitest.
import { i18n } from '../../src/i18n';

i18n.t('appName');
i18n.t('title', { ns: 'ergebnis' });

// @ts-expect-error: the key does not exist in the common namespace.
i18n.t('doesNotExist');

// @ts-expect-error: the key exists in another namespace only.
i18n.t('title');
