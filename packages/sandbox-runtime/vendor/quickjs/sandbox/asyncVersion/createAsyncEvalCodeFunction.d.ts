import type { Scope } from 'quickjs-emscripten-core';
import type { CodeFunctionAsyncInput } from '../../types/CodeFunctionInput.js';
import type { SandboxEvalCode } from '../../types/SandboxEvalCode.js';
export declare const createAsyncEvalCodeFunction: (input: CodeFunctionAsyncInput, scope: Scope) => SandboxEvalCode;
