import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { ConfirmResultDto } from './confirm-result.dto';

describe('ConfirmResultDto', () => {
  it('requires at least one selected checklist requirement', async () => {
    const dto = Object.assign(new ConfirmResultDto(), { requirementIds: [] });

    const errors = await validate(dto);

    expect(errors.find((error) => error.property === 'requirementIds')?.constraints).toHaveProperty('arrayMinSize');
  });
});
