import { describe, expect, it } from '@jest/globals';
import { requirementMatchesFinding } from './checklist-finding-matcher';

describe('checklist finding matcher', () => {
  it.each([
    ['Общий анализ мочи', 'Urinalysis'],
    ['Общий анализ крови', 'Complete blood count (CBC)'],
    ['Коагулограмма (ИНР)', 'INR'],
    ['Коагулограмма (aPTT)', 'APTT'],
    ['Коагулограмма (ПТИ)', 'PTI (prothrombin index)'],
    ['Группа крови, резус-фактор', 'Blood group and Rh factor'],
  ])('matches the extracted name %s to seeded name %s', (findingName, requirementName) => {
    expect(requirementMatchesFinding(findingName, requirementName)).toBe(true);
  });

  it('does not match an unsupported coagulation test to a different checklist test', () => {
    expect(requirementMatchesFinding('Коагулограмма (PT)', 'PTI (prothrombin index)')).toBe(false);
  });
});
