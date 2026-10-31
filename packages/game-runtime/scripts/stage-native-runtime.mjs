#!/usr/bin/env node
import { copyFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
const build = process.argv[2];
if (!build) { throw new Error('Usage: stage-native-runtime <native build directory>'); }
const source = join(resolve(build), process.platform === 'win32' ? 'game-worker.exe' : 'game-worker');
await access(source, constants.X_OK);
const destination = new URL('../dist/', import.meta.url);
const destinationPath = (await import('node:url')).fileURLToPath(destination);
await mkdir(destinationPath, { recursive: true });
await copyFile(source, join(destinationPath, process.platform === 'win32' ? 'native-game-worker.exe' : 'native-game-worker'));
console.log('Staged native worker runtime asset');
