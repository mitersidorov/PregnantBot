import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Cycle } from '../../cycles/entities/cycle.entity';
import { MedicalResult } from '../../records/entities/medical-result.entity';
import { ChecklistProgress } from '../entities/checklist-progress.entity';
import { Requirement } from '../entities/requirement.entity';

@Injectable()
export class ChecklistService {
  constructor(
    @InjectRepository(Cycle) private readonly cycles: Repository<Cycle>,
    @InjectRepository(ChecklistProgress) private readonly progress: Repository<ChecklistProgress>,
    @InjectRepository(Requirement) private readonly requirements: Repository<Requirement>,
  ) {}

  async initializeForCycle(manager: EntityManager, cycle: Cycle): Promise<void> {
    const requirements = manager.getRepository(Requirement);
    const progress = manager.getRepository(ChecklistProgress);
    const results = manager.getRepository(MedicalResult);
    const activeRequirements = await requirements.findBy({ active: true });

    for (const requirement of activeRequirements) {
      const reusable = await results
        .createQueryBuilder('result')
        .innerJoin('result.requirements', 'requirement', 'requirement.id = :requirementId', {
          requirementId: requirement.id,
        })
        .where('result.interpretationStatus = :confirmed', { confirmed: 'confirmed' })
        .andWhere('result.supersededBy IS NULL')
        .orderBy('result.resultDate', 'DESC')
        .getOne();
      const resultDate = reusable ? resultDateForRequirement(reusable, requirement.id) : null;
      const valid =
        !!reusable &&
        (requirement.branchMetadata?.validityAppliesOnlyIfNoAbnormalities !== true ||
          reusable.normality === 'normal') &&
        (requirement.validityDays == null ||
          (!!resultDate &&
            new Date(new Date(resultDate).getTime() + requirement.validityDays * 86400000) >=
              new Date(cycle.startDate)));

      await progress.save(
        progress.create({
          cycleId: cycle.id,
          requirementId: requirement.id,
          status: valid ? 'complete' : 'pending',
          resultId: valid ? reusable.id : null,
        }),
      );
    }
  }

  async updateProgressForRole(
    cycleId: string,
    requirementId: string,
    status: string,
    role: 'wife' | 'husband',
  ): Promise<ChecklistProgress> {
    const cycle = await this.cycles.findOneBy({ id: cycleId });
    if (!cycle) throw new NotFoundException('Cycle not found');

    const row = await this.progress.findOneBy({ cycleId, requirementId });
    if (!row) throw new NotFoundException('Checklist requirement not found for cycle');

    const requirement = await this.requirements.findOneBy({ id: requirementId });
    if (!requirement) throw new NotFoundException('Checklist requirement not found');
    if (requirement.patientApplicability !== 'both' && requirement.patientApplicability !== role) {
      throw new ForbiddenException('Only the patient responsible for this test can update its checklist status.');
    }
    if (status === 'complete' && !row.resultId) {
      throw new ForbiddenException('Confirm and link a result before marking this requirement complete.');
    }

    row.status = status;
    return this.progress.save(row);
  }

  async applyConfirmedResult(
    manager: EntityManager,
    result: MedicalResult,
    requirements: Requirement[],
  ): Promise<void> {
    for (const requirement of requirements) {
      const resultDate = resultDateForRequirement(result, requirement.id);
      await manager.query(
        `UPDATE checklist_progress p JOIN cycles c ON c.id = p.cycle_id JOIN requirements q ON q.id = p.requirement_id SET p.status = 'complete', p.result_id = ? WHERE p.requirement_id = ? AND c.status = 'active' AND (q.validity_days IS NULL OR (? IS NOT NULL AND DATE_ADD(?, INTERVAL q.validity_days DAY) >= c.start_date)) AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(q.branch_metadata, '$.validityAppliesOnlyIfNoAbnormalities')), 'false') <> 'true' OR ? = 'normal')`,
        [result.id, requirement.id, resultDate, resultDate, result.normality ?? ''],
      );
    }
  }

  async resetActiveProgressForResult(manager: EntityManager, resultId: string): Promise<void> {
    await manager.query(
      `UPDATE checklist_progress p
       JOIN cycles c ON c.id = p.cycle_id
       SET p.status = 'pending', p.result_id = NULL
       WHERE p.result_id = ? AND c.status = 'active'`,
      [resultId],
    );
  }
}

function resultDateForRequirement(result: MedicalResult, requirementId: string): string | null {
  const linkedFindings = (result.extractedFindings ?? []).filter((finding) =>
    finding.requirementIds?.includes(requirementId),
  );
  if (linkedFindings.length === 0) return result.resultDate;
  const dates = linkedFindings
    .filter((finding) => finding.resultDate)
    .map((finding) => finding.resultDate as string)
    .sort((a, b) => b.localeCompare(a));
  return dates[0] ?? null;
}
