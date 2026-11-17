import { CHECKLIST_TEST_NAME_LABELS } from './interpretation.service';

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const labelByNormalizedName = new Map<string, string>();
for (const [source, label] of Object.entries(CHECKLIST_TEST_NAME_LABELS)) {
  labelByNormalizedName.set(normalize(source), normalize(label));
  labelByNormalizedName.set(normalize(label), normalize(label));
}

const aliases: Record<string, string> = {
  'Коагулограмма (ИНР)': CHECKLIST_TEST_NAME_LABELS.INR,
  'Коагулограмма (INR)': CHECKLIST_TEST_NAME_LABELS.INR,
  'Коагулограмма (МНО)': CHECKLIST_TEST_NAME_LABELS.INR,
  'Коагулограмма (aPTT)': CHECKLIST_TEST_NAME_LABELS.APTT,
  'Коагулограмма (АПТВ)': CHECKLIST_TEST_NAME_LABELS.APTT,
  'Коагулограмма (ПТИ)': CHECKLIST_TEST_NAME_LABELS['PTI (prothrombin index)'],
  'Rh factor': CHECKLIST_TEST_NAME_LABELS['Blood group and Rh factor'],
  'Blood group, Rh factor': CHECKLIST_TEST_NAME_LABELS['Blood group and Rh factor'],
};
for (const [alias, label] of Object.entries(aliases)) {
  labelByNormalizedName.set(normalize(alias), normalize(label));
}

export function canonicalChecklistTestName(testName: string | null | undefined): string | null {
  if (!testName?.trim()) return null;
  const normalized = normalize(testName);
  return labelByNormalizedName.get(normalized) ?? normalized;
}

export function requirementMatchesFinding(findingName: string | null | undefined, requirementName: string): boolean {
  const finding = canonicalChecklistTestName(findingName);
  return !!finding && finding === canonicalChecklistTestName(requirementName);
}
