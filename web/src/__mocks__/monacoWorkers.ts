// Monaco's `?worker` imports are a Vite transform the Jest CommonJS pipeline
// cannot load, and jsdom has no workers for Monaco to start.
export function installMonacoWorkers(): void {}
