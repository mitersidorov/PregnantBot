import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { DataSource, Repository } from 'typeorm';
import { ChecklistService } from '../../checklist/services/checklist.service';
import { S3StorageService } from '../../common/s3/s3-storage.service';
import { Requirement } from '../../checklist/entities/requirement.entity';
import { MedicalFile } from '../entities/medical-file.entity';
import { MedicalResult } from '../entities/medical-result.entity';
import { InterpretationService } from './interpretation.service';
import type { UploadedMedicalFile } from '../types/uploaded-medical-file.interface';
import type { ChecklistMatchedFinding, ExtractedFinding } from '../types/extracted-finding.interface';

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(MedicalFile) private readonly files: Repository<MedicalFile>,
    @InjectRepository(MedicalResult) private readonly results: Repository<MedicalResult>,
    @InjectRepository(Requirement) private readonly requirements: Repository<Requirement>,
    private readonly storage: S3StorageService,
    private readonly interpretation: InterpretationService,
    private readonly dataSource: DataSource,
    private readonly checklist: ChecklistService,
  ) {}
  async upload(file: UploadedMedicalFile, userId: number): Promise<{ file: MedicalFile; result: MedicalResult }> {
    if (!file || file.size > 20 * 1024 * 1024)
      throw new PayloadTooLargeException('File is required and must be at most 20 MB');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
      throw new UnsupportedMediaTypeException('Only PDF, JPEG, and PNG files are accepted');
    if (!this.matchesContentType(file.buffer, file.mimetype))
      throw new UnsupportedMediaTypeException('File content does not match its declared media type');
    const id = randomUUID();
    const key = `medical/${id}`;
    await this.storage.uploadFile({ key, body: file.buffer, contentType: file.mimetype });
    try {
      const { record, result } = await this.dataSource.transaction(async (manager) => {
        const record = await manager.getRepository(MedicalFile).save(
          manager.getRepository(MedicalFile).create({
            id,
            uploadedBy: String(userId),
            objectKey: key,
            originalName: file.originalname.replace(/[\\/\r\n]/g, '_').slice(0, 255),
            contentType: file.mimetype,
            byteSize: file.size,
          }),
        );
        const result = await manager.getRepository(MedicalResult).save(
          manager.getRepository(MedicalResult).create({
            fileId: id,
            versionNumber: 1,
            testName: null,
            resultDate: null,
            summary: null,
            normality: null,
            interpretationStatus: 'pending',
            modelVersion: null,
            promptVersion: null,
            schemaVersion: '1',
            supersededBy: null,
          }),
        );
        result.requirements = [];
        record.results = [result];
        return { record, result };
      });
      return { file: record, result };
    } catch (error) {
      await this.storage.deleteFile(key).catch(() => undefined);
      throw error;
    }
  }
  private matchesContentType(bytes: Buffer, contentType: string): boolean {
    if (contentType === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    if (contentType === 'image/jpeg')
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return (
      contentType === 'image/png' &&
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  async list(): Promise<MedicalFile[]> {
    return this.files.find({ relations: { results: { requirements: true } }, order: { uploadedAt: 'DESC' } });
  }
  async file(id: string): Promise<MedicalFile> {
    const file = await this.files.findOneBy({ id });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
  async download(id: string): Promise<{ file: MedicalFile; bytes: Buffer }> {
    const file = await this.file(id);
    const bytes = await this.storage.downloadFile(file.objectKey);
    return { file, bytes };
  }
  async downloadStream(id: string): Promise<{ file: MedicalFile; stream: Readable }> {
    const file = await this.file(id);
    const stream = await this.storage.downloadFileStream(file.objectKey);
    return { file, stream };
  }
  async archive(): Promise<PassThrough> {
    const files = await this.files.find({ order: { uploadedAt: 'ASC' } });
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const stream = new PassThrough();
    archive.on('error', (error) => stream.destroy(error));
    archive.pipe(stream);
    void (async () => {
      try {
        for (const file of files)
          archive.append(await this.storage.downloadFile(file.objectKey), { name: `${file.id}/${file.originalName}` });
        await archive.finalize();
      } catch (error) {
        stream.destroy(error instanceof Error ? error : new Error('Archive generation failed'));
      }
    })();
    return stream;
  }
  async interpret(
    resultId: string,
    userId: number,
    role: 'wife' | 'husband',
  ): Promise<MedicalResult & { matchedFindings: ChecklistMatchedFinding[] }> {
    return this.dataSource.transaction(async (manager) => {
      const results = manager.getRepository(MedicalResult);
      const result = await results
        .createQueryBuilder('result')
        .setLock('pessimistic_write')
        .where('result.id = :id', { id: resultId })
        .getOne();
      if (!result) throw new NotFoundException('Result not found');
      if (result.supersededBy) throw new ConflictException('A superseded result version cannot be interpreted.');
      if (result.interpretationStatus !== 'pending') {
        throw new ConflictException('Only a pending result can be interpreted.');
      }

      const file = await manager
        .getRepository(MedicalFile)
        .createQueryBuilder('file')
        .setLock('pessimistic_write')
        .where('file.id = :id', { id: result.fileId })
        .getOne();
      if (!file) throw new NotFoundException('File not found');
      this.assertOwner(file, userId);

      const latest = await results
        .createQueryBuilder('result')
        .where('result.fileId = :fileId', { fileId: result.fileId })
        .orderBy('result.versionNumber', 'DESC')
        .getOne();
      if (!latest || latest.id !== result.id) {
        throw new ConflictException('Only the latest result version can be interpreted.');
      }

      const contents = await this.storage.downloadFile(file.objectKey);
      const proposal = await this.interpretation.proposeFile(contents, file.originalName, file.contentType);
      result.testName = proposal.testName;
      result.resultDate = proposal.resultDate;
      result.summary = proposal.summary;
      result.extractedFindings = proposal.findings ?? [
        {
          testName: proposal.testName,
          resultDate: proposal.resultDate,
          summary: proposal.summary,
          pageNumber: null,
        },
      ];
      result.interpretationStatus = 'proposed';
      result.modelVersion = this.interpretation.modelName;
      result.promptVersion = '2';
      result.schemaVersion = '2';
      result.requirements = [];
      const saved = await results.save(result);
      const activeRequirements = await this.requirements.find({ where: { active: true } });
      const matchedFindings = (saved.extractedFindings ?? []).flatMap((finding, findingIndex) => {
        const requirementIds = activeRequirements
          .filter(
            (requirement) =>
              requirement.name === finding.testName &&
              (requirement.patientApplicability === role || requirement.patientApplicability === 'both'),
          )
          .map((requirement) => requirement.id);
        return requirementIds.length > 0 ? [{ ...finding, findingIndex, requirementIds }] : [];
      });
      return { ...saved, matchedFindings };
    });
  }
  async confirm(
    id: string,
    input: {
      testName?: string;
      resultDate?: string;
      summary?: string;
      extractedFindings?: ExtractedFinding[];
      requirementIds: string[];
      normality?: 'normal' | 'abnormal';
    },
    userId: number,
    role: 'wife' | 'husband',
  ): Promise<MedicalResult> {
    return this.dataSource.transaction(async (manager) => {
      const results = manager.getRepository(MedicalResult);
      const result = await results
        .createQueryBuilder('result')
        .setLock('pessimistic_write')
        .where('result.id = :id', { id })
        .getOne();
      if (!result) throw new NotFoundException('Result not found');
      const file = await manager.getRepository(MedicalFile).findOneBy({ id: result.fileId });
      if (!file) throw new NotFoundException('File not found');
      this.assertOwner(file, userId);
      if (result.supersededBy) throw new ForbiddenException('A superseded result version cannot be confirmed.');
      if (result.interpretationStatus !== 'proposed') {
        throw new ConflictException('Only a proposed result can be confirmed.');
      }
      if (!Array.isArray(input.requirementIds) || input.requirementIds.length === 0) {
        throw new BadRequestException('Select at least one checklist requirement before confirming the result.');
      }
      let findings = input.extractedFindings ?? result.extractedFindings ?? [];
      if (findings.length === 0) {
        findings = [
          {
            testName: input.testName ?? result.testName,
            resultDate: input.resultDate ?? result.resultDate,
            summary: input.summary ?? result.summary,
            pageNumber: null,
          },
        ];
      }
      const requestedRequirementIds = [
        ...new Set([...input.requirementIds, ...findings.flatMap((finding) => finding.requirementIds ?? [])]),
      ];
      const requirements = await manager.getRepository(Requirement).findByIds(requestedRequirementIds);
      if (requirements.length !== requestedRequirementIds.length)
        throw new NotFoundException('One or more requirements not found');
      if (
        requirements.some(
          (requirement) => requirement.patientApplicability !== 'both' && requirement.patientApplicability !== role,
        )
      ) {
        throw new ForbiddenException('A result can only be linked to requirements for its uploader.');
      }
      const requiresNormality = requirements.some(
        (requirement) => requirement.branchMetadata?.validityAppliesOnlyIfNoAbnormalities === true,
      );
      if (requiresNormality && !input.normality && !result.normality) {
        throw new BadRequestException('Explicitly confirm whether the spermogram has abnormalities.');
      }
      result.testName = input.testName ?? result.testName;
      result.resultDate = input.resultDate ?? result.resultDate;
      result.summary = input.summary ?? result.summary;
      result.normality = input.normality ?? result.normality;
      const requirementIdsByFinding = new Map<number, string[]>();
      findings.forEach((finding, index) => requirementIdsByFinding.set(index, finding.requirementIds ?? []));
      for (const requirementId of requestedRequirementIds) {
        if ([...requirementIdsByFinding.values()].some((ids) => ids.includes(requirementId))) continue;
        const requirement = requirements.find((item) => item.id === requirementId);
        const matchingIndex = findings.findIndex((finding) => finding.testName === requirement?.name);
        if (matchingIndex < 0) {
          throw new BadRequestException('Every selected checklist requirement must be linked to a matching finding.');
        }
        requirementIdsByFinding.get(matchingIndex)!.push(requirementId);
      }
      result.extractedFindings = findings.map((finding, index) => ({
        ...finding,
        requirementIds: [...new Set(requirementIdsByFinding.get(index) ?? [])],
      }));
      result.requirements = requirements;
      result.interpretationStatus = 'confirmed';
      const saved = await results.save(result);
      await this.checklist.applyConfirmedResult(manager, saved, requirements);
      return saved;
    });
  }
  private assertOwner(file: MedicalFile, userId: number): void {
    if (file.uploadedBy !== String(userId)) {
      throw new ForbiddenException('Only the user who uploaded this document can interpret or confirm it.');
    }
  }
}
