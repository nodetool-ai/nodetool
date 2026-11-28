// The guest entry installs structuredClone before any node code runs. The
// models test bundle has no entry, and timeline modules it imports call
// structuredClone while they evaluate, so this module installs it and must be
// the test's first import.
import { installStructuredClone } from '../guest/env/structured-clone.mjs';
installStructuredClone(globalThis);
