import { expose } from 'comlink';
import { createCoreEndpoint } from './endpoint';

// Entry of the Web Worker: the calculation core behind Comlink (8.5).
expose(createCoreEndpoint());
