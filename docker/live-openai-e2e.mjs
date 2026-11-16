import { createHmac } from 'node:crypto';

const api = process.env.E2E_API_URL || 'http://backend:3000';
const botToken = '123456789:test-token-for-local-e2e-only';
const apiKey = 'local-test-api-key';
const telegramStub = process.env.TELEGRAM_STUB_URL;

async function telegramRequestCount() {
  const response = await fetch(`${telegramStub}/requests`);
  if (!response.ok) throw new Error('Telegram stub request counter is unavailable');
  const data = await response.json();
  check(Number.isInteger(data.count), 'Telegram stub returned an invalid request count');
  return data.count;
}

const telegramCountBefore = telegramStub ? await telegramRequestCount() : undefined;

function initData(userId) {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `e2e-${userId}-${Date.now()}`,
    user: JSON.stringify({ id: userId, first_name: 'Synthetic', last_name: 'Test' }),
  });
  const check = [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  values.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return values.toString();
}

async function call(path, userId, options = {}) {
  const headers = {
    'X-API-KEY': apiKey,
    'X-Telegram-Init-Data': initData(userId),
    ...options.headers,
  };
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${api}${path}`, { ...options, headers, redirect: 'manual' });
  return response;
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function pdf(lines) {
  const escapePdf = (line) => line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = ['BT', '/F1 12 Tf', '50 750 Td', ...lines.flatMap((line, i) => [
    ...(i ? ['0 -18 Td'] : []),
    `(${escapePdf(line)}) Tj`,
  ]), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(output));
    output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

async function json(response, label, expectedStatus) {
  check(response.status === expectedStatus, `${label} returned HTTP ${response.status}`);
  return response.json();
}

async function uploadPdf(userId, name, lines) {
  const form = new FormData();
  form.set('file', new Blob([pdf(lines)], { type: 'application/pdf' }), name);
  const response = await call('/records/uploads', userId, { method: 'POST', body: form });
  const data = await json(response, 'Private file upload', 201);
  check(data.file?.id && data.result?.id, 'Upload response did not include file and result IDs');
  check(data.result.interpretationStatus === 'pending', 'Upload did not leave interpretation pending');
  return data;
}

async function interpretUpload(upload, userId) {
  const result = await json(
    await call(`/records/results/${encodeURIComponent(upload.result.id)}/interpret`, userId, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    'Explicit OpenAI interpretation',
    200,
  );
  check(result.id === upload.result.id, 'Interpretation created a new result version instead of updating the pending row');
  check(result.interpretationStatus === 'proposed', 'Interpretation did not update the pending result to proposed');
  check(result.versionNumber === upload.result.versionNumber, 'Interpretation unexpectedly changed the result version');
  const repeated = await call(`/records/results/${encodeURIComponent(result.id)}/interpret`, userId, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  check(repeated.status === 409, `Repeated interpretation returned HTTP ${repeated.status}, expected 409`);
  return { ...upload, result };
}

const wifeId = 111111111;
const husbandId = 222222222;
const cycleDate = new Date().toISOString().slice(0, 10);

if (process.argv.includes('--verify-download')) {
  const history = await json(await call('/records', wifeId), 'Existing synthetic history', 200);
  const sample = history.find((file) => /\.pdf$/i.test(file.originalName || ''));
  check(sample?.id, 'No synthetic PDF is available for signed-download verification');
  const download = await call(`/records/${encodeURIComponent(sample.id)}/download`, wifeId);
  check(download.status === 200, `Authorized download returned HTTP ${download.status}, expected 200`);
  const fileBytes = Buffer.from(await download.arrayBuffer());
  check(download.headers.get('content-type')?.startsWith('application/pdf'), 'Downloaded object is not served as PDF');
  check(fileBytes.length > 8 && fileBytes.subarray(0, 5).toString('ascii') === '%PDF-', 'Downloaded synthetic PDF is empty or invalid');

  const archive = await call('/records/archive', wifeId);
  check(archive.status === 200, `Archive returned HTTP ${archive.status}`);
  const archiveBytes = Buffer.from(await archive.arrayBuffer());
  check(archive.headers.get('content-type')?.includes('application/zip'), 'Archive response is not application/zip');
  check(archiveBytes.length > 4 && archiveBytes.subarray(0, 2).toString('ascii') === 'PK', 'Archive bytes are not a ZIP file');
  console.log('Signed download and ZIP archive content checks passed.');
  process.exit(0);
}

const cyclesResponse = await call('/cycles', wifeId);
check(cyclesResponse.ok, `Wife cycle list returned HTTP ${cyclesResponse.status}`);
if (process.argv.includes('--proxy-check')) {
  const proxyResponse = await fetch(`${process.env.E2E_WEBAPP_URL || 'http://127.0.0.1:4200'}/api/cycles`, {
    headers: { 'X-Telegram-Init-Data': initData(wifeId) },
  });
  check(proxyResponse.ok, `Same-origin server-key proxy returned HTTP ${proxyResponse.status}`);
  console.log('Same-origin Nginx proxy passed: Telegram initData forwarded and API key injected server-side.');
  process.exit(0);
}
const cycleResponse = await call('/cycles', wifeId, {
  method: 'POST',
  body: JSON.stringify({ startDate: cycleDate }),
});
const cycle = await json(cycleResponse, 'Wife cycle creation', 201);
check(cycle.id, 'Cycle creation response omitted its ID');

const husbandCreate = await call('/cycles', husbandId, {
  method: 'POST',
  body: JSON.stringify({ startDate: cycleDate }),
});
check(husbandCreate.status === 403, `Husband cycle creation returned HTTP ${husbandCreate.status}, expected 403`);

const cycleDetailResponse = await call(`/cycles/${encodeURIComponent(cycle.id)}`, wifeId);
const cycleDetail = await json(cycleDetailResponse, 'Cycle detail', 200);
const checklist = cycleDetail.checklist || cycle.checklist || [];
const cbcItem = checklist.find((item) => /blood count|\bcbc\b|общий анализ крови|оак/i.test(item.requirement?.name || ''));
const wifeItem = cbcItem || checklist.find((item) => item.requirement?.patientApplicability === 'wife');
check(wifeItem?.requirementId, 'No applicable seeded wife requirement was found in the cycle checklist');

const cbcUpload = await uploadPdf(wifeId, 'synthetic-cbc.pdf', [
  'COMPLETE BLOOD COUNT',
  `Result date: ${cycleDate}`,
  'Hemoglobin: 132 g/L',
  'Leukocytes: 5.4 x10^9/L',
  'Platelets: 240 x10^9/L',
  'Synthetic data for local software test only',
]);
const cbc = await interpretUpload(cbcUpload, wifeId);
check(cbc.result.testName === 'Общий анализ крови', `Known checklist test name was not returned in Russian: ${cbc.result.testName}`);
check(/\p{Script=Cyrillic}/u.test(cbc.result.summary || ''), 'Live OpenAI summary was not returned in Russian');
const confirmed = await json(
  await call(`/records/results/${encodeURIComponent(cbc.result.id)}/confirm`, wifeId, {
    method: 'POST',
    body: JSON.stringify({ requirementIds: [wifeItem.requirementId] }),
  }),
  'Explicit result confirmation',
  200,
);
check(confirmed.interpretationStatus === 'confirmed', 'User-confirmed proposal is not confirmed');

const historyResponse = await call('/records', husbandId);
const history = await json(historyResponse, 'Shared record history', 200);
const sharedFile = history.find((file) => file.id === cbc.file.id);
check(sharedFile, 'Husband cannot see the wife-uploaded shared record');
const saved = sharedFile.results?.find((result) => result.id === cbc.result.id);
check(saved?.requirements?.some((requirement) => requirement.id === wifeItem.requirementId), 'Confirmed requirement link is missing');

const download = await call(`/records/${encodeURIComponent(cbc.file.id)}/download`, husbandId);
check(download.status === 200, `Authorized download returned HTTP ${download.status}, expected 200`);
const downloadedBytes = Buffer.from(await download.arrayBuffer());
check(download.headers.get('content-type')?.startsWith('application/pdf'), 'Stream download did not return a PDF');
check(downloadedBytes.length > 8 && downloadedBytes.subarray(0, 5).toString('ascii') === '%PDF-', 'Signed download PDF content is empty or invalid');
const archive = await call('/records/archive', husbandId);
check(archive.status === 200, `Shared archive returned HTTP ${archive.status}`);
const archiveBytes = Buffer.from(await archive.arrayBuffer());
check(archive.headers.get('content-type')?.includes('application/zip'), 'Archive response is not application/zip');
check(archiveBytes.length > 4 && archiveBytes.subarray(0, 2).toString('ascii') === 'PK', 'Archive bytes are not a ZIP file');

const unknownUpload = await uploadPdf(wifeId, 'synthetic-unclassified-note.pdf', [
  'GENERAL NOTE',
  `Document date: ${cycleDate}`,
  'This is synthetic local test data and contains no laboratory measurement.',
]);
const unknown = await interpretUpload(unknownUpload, wifeId);
const historyAfterUnknown = await json(await call('/records', wifeId), 'History with unclassified proposal', 200);
const unknownRecord = historyAfterUnknown.find((file) => file.id === unknown.file.id);
check(unknownRecord?.results?.some((result) => result.id === unknown.result.id && result.requirements?.length === 0), 'Unlinked proposed result was not retained in history');

if (telegramStub) {
  const telegramCountAfter = await telegramRequestCount();
  check(
    telegramCountAfter === telegramCountBefore,
    `Unexpected Telegram messages were sent during E2E (${telegramCountBefore} -> ${telegramCountAfter})`,
  );
}

console.log('Live OpenAI E2E passed: pending upload, explicit one-time interpretation, confirmation/link, wife-only cycle access, shared history, PDF bytes, ZIP bytes, and unlinked proposal; Telegram stub received no unintended messages.');
