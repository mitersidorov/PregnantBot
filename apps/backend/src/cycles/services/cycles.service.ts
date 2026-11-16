import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChecklistService } from '../../checklist/services/checklist.service';
import { Cycle } from '../entities/cycle.entity';

@Injectable()
export class CyclesService {
  constructor(
    @InjectRepository(Cycle) private readonly cycles: Repository<Cycle>,
    private readonly dataSource: DataSource,
    private readonly checklist: ChecklistService,
  ) {}
  async create(startDate: string, userId: number): Promise<Cycle> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const cycles = runner.manager.getRepository(Cycle);
      const cycle = await cycles.save(cycles.create({ startDate, startedBy: String(userId), status: 'active' }));
      await this.checklist.initializeForCycle(runner.manager, cycle);
      await runner.commitTransaction();
      return this.get(cycle.id);
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
  async list(): Promise<Cycle[]> {
    return this.cycles.find({
      relations: { checklist: { requirement: true } },
      order: { startDate: 'DESC' },
    });
  }
  async get(id: string): Promise<Cycle> {
    const cycle = await this.cycles.findOne({ where: { id }, relations: { checklist: { requirement: true } } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    return cycle;
  }
  async complete(id: string): Promise<Cycle> {
    const cycle = await this.cycles.findOneBy({ id });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status === 'completed') return this.get(id);
    cycle.status = 'completed';
    await this.cycles.save(cycle);
    return this.get(id);
  }
}
