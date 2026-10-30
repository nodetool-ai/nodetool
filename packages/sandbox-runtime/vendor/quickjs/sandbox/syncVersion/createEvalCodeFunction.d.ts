import type { Scope } from 'quickjs-emscripten-core';
import type { CodeFunctionInput } from '../../types/CodeFunctionInput.js';
import type { SandboxEvalCode } from '../../types/SandboxEvalCode.js';
export declare const createEvalCodeFunction: (input: CodeFunctionInput, scope: Scope) => SandboxEvalCode;
