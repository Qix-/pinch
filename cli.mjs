#!/usr/bin/env node

import {promises as fsp} from 'fs';

import Pinch from './index.mjs';

if (process.argv.length !== 4) {
	console.error('usage: pinch <input.js> <output.js>');
	process.exit(2);
}

const contents = await fsp.readFile(process.argv[2], 'utf-8');
const transformed = Pinch.compile(contents);
await fsp.writeFile(process.argv[3], transformed, 'utf-8');
