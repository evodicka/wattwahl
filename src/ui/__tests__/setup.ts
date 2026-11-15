import { configure } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals here, so Testing Library cannot register its
// cleanup itself: unmount every render after each test.
afterEach(cleanup);

// A chart is a lazy chunk: the first one loads slowly when many test files run
// at once, so waiting for it may take longer than the default second.
configure({ asyncUtilTimeout: 5000 });
