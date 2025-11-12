import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// resolve JSON file from several candidate locations so the script still works
// if files were moved between project root/tests and ui/tests.
const candidates = [
  path.resolve(__dirname, 'no_video_inputs.json'),
  path.resolve(__dirname, '..', 'tests', 'no_video_inputs.json'),
  path.resolve(__dirname, '..', '..', 'tests', 'no_video_inputs.json'),
  path.resolve(process.cwd(), 'tests', 'no_video_inputs.json'),
  path.resolve(process.cwd(), 'ui', 'tests', 'no_video_inputs.json'),
];

let filePath = candidates.find(p => fs.existsSync(p));
if (!filePath) {
  console.error('no_video_inputs.json not found. Searched:', candidates);
  process.exit(2);
}

function loadData() {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function validateSchema(item) {
  const required = ['timestamp', 'action', 'kneeAngle', 'hipAngle', 'stability', 'feedback', 'isError'];
  for (const k of required) {
    if (!(k in item)) return `missing field ${k}`;
  }
  // basic types
  if (typeof item.timestamp !== 'string') return 'timestamp must be string';
  if (typeof item.action !== 'string') return 'action must be string';
  if (typeof item.kneeAngle !== 'number') return 'kneeAngle must be number';
  if (typeof item.hipAngle !== 'number') return 'hipAngle must be number';
  if (typeof item.stability !== 'string') return 'stability must be string';
  if (typeof item.feedback !== 'string') return 'feedback must be string';
  if (typeof item.isError !== 'boolean') return 'isError must be boolean';
  return null;
}

function main() {
  let data;
  try {
    data = loadData();
  } catch (e) {
    console.error('Failed to load JSON:', e.message);
    process.exit(2);
  }

  if (!Array.isArray(data)) {
    console.error('Data must be an array');
    process.exit(2);
  }

  if (data.length < 2) {
    console.error('Need at least two records to compute duration');
    process.exit(2);
  }

  // validate schema
  for (let i = 0; i < data.length; i++) {
    const err = validateSchema(data[i]);
    if (err) {
      console.error(`Item ${i} schema error: ${err}`);
      process.exit(2);
    }
  }

  // compute duration between first and last timestamp
  const t0 = Date.parse(data[0].timestamp);
  const tn = Date.parse(data[data.length - 1].timestamp);
  if (isNaN(t0) || isNaN(tn)) {
    console.error('Invalid timestamp format');
    process.exit(2);
  }

  const durationSec = (tn - t0) / 1000;
  console.log(`Records: ${data.length}, Duration: ${durationSec}s`);

  if (durationSec <= 60) {
    console.error('Duration is not greater than 60 seconds');
    process.exit(1);
  }

  console.log('Schema OK and duration > 60s -> TEST PASS');
  process.exit(0);
}

main();
