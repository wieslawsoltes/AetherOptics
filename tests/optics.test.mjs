import test from 'node:test';
import { BENCHMARKS } from '../src/benchmarks.js';
for(const [name,run] of BENCHMARKS)test(name,run);
