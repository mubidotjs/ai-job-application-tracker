import { fixtures } from '../fixtures/jobs.ts';
import { importJobs } from '../lib/store.ts';
import { closeDb } from '../lib/db.ts';
console.log('Synthetic fixture import:', importJobs(fixtures));
closeDb();
