import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals here, so Testing Library cannot register its
// cleanup itself: unmount every render after each test.
afterEach(cleanup);
