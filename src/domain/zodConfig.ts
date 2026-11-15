import { z } from 'zod';

// No code generation at run time: zod's JIT parser and its probe for it call
// `new Function`, which the Content Security Policy forbids (architecture
// 8.11) and reports as a violation. The checks run through the plain parser.
z.config({ jitless: true });
