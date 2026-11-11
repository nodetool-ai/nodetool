// Importing the processing context must not require a SQLite capability. The
// image codec tests install only image/files, and no model grant exists here.
import { GuestContext } from '../guest/host/context.mjs';
if (globalThis.__host.sqlite !== undefined) throw new Error('Import regression must run without SQLite');
const context = new GuestContext({ userId: 'image-only' });
if (context.hasModelInterface('createAsset') || Object.keys(context._models.interfaces).length !== 0) throw new Error('Unconfigured context acquired persistence');
if (typeof GuestContext !== 'function') throw new Error('ProcessingContext import was not inspected');
globalThis.__modelChecks = 2;
globalThis.__modelParity = '{}';
globalThis.__documentParity = '{}';
globalThis.__nodetool = {};
