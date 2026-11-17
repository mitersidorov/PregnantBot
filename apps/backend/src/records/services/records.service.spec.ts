import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MedicalFile } from '../entities/medical-file.entity';
import { MedicalResult } from '../entities/medical-result.entity';
import { Requirement } from '../../checklist/entities/requirement.entity';
import { RecordsService } from './records.service';

describe('RecordsService uploads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects spoofed MIME types before writing to storage', async () => {
    const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.upload(
        { buffer: Buffer.from('not a pdf'), size: 10, mimetype: 'application/pdf', originalname: 'fake.pdf' } as never,
        101,
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('stores the upload and a pending result without calling OpenAI', async () => {
    const fileRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };
    const resultRepository = {
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => row),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalFile | typeof MedicalResult) =>
        entity === MedicalFile ? fileRepository : resultRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(<T>(work: (value: typeof manager) => Promise<T>) => work(manager)),
    };
    const storage = { uploadFile: jest.fn(), deleteFile: jest.fn() };
    const interpretation = { proposeFile: jest.fn(), modelName: 'test-model' };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      interpretation as never,
      dataSource as never,
      {} as never,
    );
    const uploaded = await service.upload(
      { buffer: Buffer.from('%PDF-1.7'), size: 8, mimetype: 'application/pdf', originalname: 'result.pdf' } as never,
      101,
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(uploaded.result).toMatchObject({
      testName: null,
      interpretationStatus: 'pending',
      versionNumber: 1,
      requirements: [],
    });
    expect(uploaded.file.results).toEqual([uploaded.result]);
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });

  it('confirms only explicitly selected links and advances active-cycle progress', async () => {
    const result = {
      id: 'result-1',
      fileId: 'file-1',
      resultDate: '2026-11-15',
      requirements: [],
      supersededBy: null,
      interpretationStatus: 'proposed',
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => result),
    };
    const resultRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn(async (value) => value),
    };
    const requirement = { id: 'req-1', patientApplicability: 'wife' };
    const requirementRepository = { findByIds: jest.fn(async () => [requirement]) };
    const fileRepository = { findOneBy: jest.fn(async () => ({ id: 'file-1', uploadedBy: '101' })) };
    const checklist = {
      applyConfirmedResult: jest
        .fn<(manager: unknown, result: unknown, requirements: unknown[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof Requirement | typeof MedicalFile) => {
        if (entity === MedicalResult) return resultRepository;
        if (entity === MedicalFile) return fileRepository;
        return requirementRepository;
      }),
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      checklist as never,
    );
    const confirmed = await service.confirm('result-1', { requirementIds: ['req-1'] }, 101, 'wife');
    expect(confirmed.interpretationStatus).toBe('confirmed');
    expect(confirmed.requirements).toEqual([requirement]);
    expect(checklist.applyConfirmedResult).toHaveBeenCalledWith(manager, confirmed, [requirement]);
  });

  it('persists each confirmed finding with its own date and checklist links', async () => {
    const result = {
      id: 'result-1',
      fileId: 'file-1',
      resultDate: '2026-10-01',
      extractedFindings: [],
      requirements: [],
      supersededBy: null,
      interpretationStatus: 'proposed',
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => result),
    };
    const resultRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn(async (value) => value),
    };
    const requirements = [
      { id: 'urinalysis', name: 'Общий анализ мочи', patientApplicability: 'wife' },
      { id: 'rh-factor', name: 'Группа крови, резус-фактор', patientApplicability: 'wife' },
    ];
    const requirementRepository = { findByIds: jest.fn(async () => requirements) };
    const fileRepository = { findOneBy: jest.fn(async () => ({ id: 'file-1', uploadedBy: '101' })) };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof Requirement | typeof MedicalFile) => {
        if (entity === MedicalResult) return resultRepository;
        if (entity === MedicalFile) return fileRepository;
        return requirementRepository;
      }),
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      { applyConfirmedResult: jest.fn() } as never,
    );

    const confirmed = await service.confirm(
      'result-1',
      {
        requirementIds: ['urinalysis', 'rh-factor'],
        extractedFindings: [
          {
            testName: 'Общий анализ мочи',
            resultDate: '2026-10-01',
            summary: 'Белок: отрицательно.',
            pageNumber: 1,
            requirementIds: ['urinalysis'],
          },
          {
            testName: 'Группа крови, резус-фактор',
            resultDate: '2018-04-12',
            summary: 'Группа крови и резус-фактор.',
            pageNumber: 9,
            requirementIds: ['rh-factor'],
          },
        ],
      },
      101,
      'wife',
    );

    expect(confirmed.extractedFindings).toEqual([
      expect.objectContaining({ pageNumber: 1, resultDate: '2026-10-01', requirementIds: ['urinalysis'] }),
      expect.objectContaining({ pageNumber: 9, resultDate: '2018-04-12', requirementIds: ['rh-factor'] }),
    ]);
  });

  it('rejects an unmatched top-level requirement instead of linking it to the first finding', async () => {
    const result = {
      id: 'result-1',
      fileId: 'file-1',
      extractedFindings: [],
      requirements: [],
      supersededBy: null,
      interpretationStatus: 'proposed',
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => result),
    };
    const save = jest.fn(async (value) => value);
    const requirement = { id: 'req-other', name: 'Unrelated requirement', patientApplicability: 'wife' };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof Requirement | typeof MedicalFile) => {
        if (entity === MedicalResult) return { createQueryBuilder: () => queryBuilder, save };
        if (entity === MedicalFile) return { findOneBy: async () => ({ id: 'file-1', uploadedBy: '101' }) };
        return { findByIds: async () => [requirement] };
      }),
    };
    const applyConfirmedResult = jest.fn();
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      { applyConfirmedResult } as never,
    );

    await expect(
      service.confirm(
        'result-1',
        {
          requirementIds: ['req-other'],
          extractedFindings: [
            { testName: 'Study one', resultDate: '2026-10-01', summary: null, pageNumber: 1 },
            { testName: 'Study two', resultDate: '2018-04-12', summary: null, pageNumber: 9 },
          ],
        },
        101,
        'wife',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
    expect(applyConfirmedResult).not.toHaveBeenCalled();
  });

  it('does not allow the other allowlisted user to confirm an uploaded result', async () => {
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ id: 'result-1', fileId: 'file-1' })),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof MedicalFile) =>
        entity === MedicalResult
          ? { createQueryBuilder: () => queryBuilder }
          : { findOneBy: async () => ({ id: 'file-1', uploadedBy: '202' }) },
      ),
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.confirm('result-1', { requirementIds: [] }, 101, 'wife')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects an empty requirement assignment before confirming or applying progress', async () => {
    const result = {
      id: 'result-1',
      fileId: 'file-1',
      interpretationStatus: 'proposed',
      supersededBy: null,
    };
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => result),
    };
    const save = jest.fn();
    const findByIds = jest.fn();
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof MedicalFile | typeof Requirement) => {
        if (entity === MedicalResult) return { createQueryBuilder: () => queryBuilder, save };
        if (entity === MedicalFile) return { findOneBy: async () => ({ id: 'file-1', uploadedBy: '101' }) };
        return { findByIds };
      }),
    };
    const applyConfirmedResult = jest.fn();
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      { applyConfirmedResult } as never,
    );

    await expect(service.confirm('result-1', { requirementIds: [] }, 101, 'wife')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findByIds).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(applyConfirmedResult).not.toHaveBeenCalled();
  });

  it('does not allow a confirmed result to be changed by confirming it again', async () => {
    const queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({
        id: 'result-1',
        fileId: 'file-1',
        interpretationStatus: 'confirmed',
        supersededBy: null,
      })),
    };
    const save = jest.fn();
    const findByIds = jest.fn();
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalResult | typeof MedicalFile | typeof Requirement) => {
        if (entity === MedicalResult) return { createQueryBuilder: () => queryBuilder, save };
        if (entity === MedicalFile) return { findOneBy: async () => ({ id: 'file-1', uploadedBy: '101' }) };
        return { findByIds };
      }),
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.confirm('result-1', { requirementIds: [] }, 101, 'wife')).rejects.toMatchObject({
      status: 409,
    });
    expect(findByIds).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('returns private file bytes for authenticated same-origin downloads', async () => {
    const file = {
      id: 'file-1',
      objectKey: 'medical/file-1',
      originalName: 'result.pdf',
      contentType: 'application/pdf',
    };
    const files = { findOneBy: jest.fn(async () => file) };
    const bytes = Buffer.from('%PDF-1.7 synthetic');
    const storage = { downloadFile: jest.fn(async (key: string) => (void key, bytes)) };
    const service = new RecordsService(
      files as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.download('file-1')).resolves.toEqual({ file, bytes });
    expect(storage.downloadFile).toHaveBeenCalledWith('medical/file-1');
  });

  it('opens a private storage stream only after resolving the file metadata', async () => {
    const file = { id: 'file-2', objectKey: 'medical/file-2' };
    const stream = {};
    const files = { findOneBy: jest.fn(async () => file) };
    const storage = { downloadFileStream: jest.fn(async (key: string) => (void key, stream)) };
    const service = new RecordsService(
      files as never,
      {} as never,
      {} as never,
      storage as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.downloadStream('file-2')).resolves.toEqual({ file, stream });
    expect(storage.downloadFileStream).toHaveBeenCalledWith('medical/file-2');
  });

  it('interprets the current pending result in place without resetting checklist progress', async () => {
    const file = {
      id: 'file-1',
      uploadedBy: '101',
      objectKey: 'medical/file-1',
      originalName: 'result.pdf',
      contentType: 'application/pdf',
    };
    const pending = {
      id: 'result-1',
      fileId: 'file-1',
      versionNumber: 1,
      testName: null,
      resultDate: null,
      summary: null,
      interpretationStatus: 'pending',
      supersededBy: null,
    };
    const currentResultQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => pending),
    };
    const latestResultQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => pending),
    };
    const fileQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => file),
    };
    const resultRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(currentResultQueryBuilder)
        .mockReturnValueOnce(latestResultQueryBuilder),
      save: jest.fn(async (value) => value),
    };
    const fileRepository = { createQueryBuilder: jest.fn(() => fileQueryBuilder) };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalFile | typeof MedicalResult) =>
        entity === MedicalFile ? fileRepository : resultRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(<T>(work: (value: typeof manager) => Promise<T>) => work(manager)),
    };
    const storage = { downloadFile: jest.fn(async (key: string) => (void key, Buffer.from('%PDF-1.7'))) };
    const interpretation = {
      proposeFile: jest.fn(async () => ({
        testName: 'CBC',
        resultDate: '2026-11-15',
        summary: 'Updated',
        pageNumber: 1,
        findings: [{ testName: 'CBC', resultDate: '2026-11-15', summary: 'Updated', pageNumber: 1 }],
      })),
      modelName: 'test-model',
    };
    const checklist = { resetActiveProgressForResult: jest.fn() };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      interpretation as never,
      dataSource as never,
      checklist as never,
    );

    const interpreted = await service.interpret('result-1', 101);

    expect(interpreted).toMatchObject({
      id: 'result-1',
      versionNumber: 1,
      interpretationStatus: 'proposed',
      testName: 'CBC',
      resultDate: '2026-11-15',
      supersededBy: null,
      requirements: [],
      extractedFindings: [{ testName: 'CBC', resultDate: '2026-11-15', summary: 'Updated', pageNumber: 1 }],
    });
    expect(resultRepository.save).toHaveBeenCalledTimes(1);
    expect(interpretation.proposeFile).toHaveBeenCalledTimes(1);
    expect(checklist.resetActiveProgressForResult).not.toHaveBeenCalled();
  });

  it('rejects repeated interpretation before calling OpenAI', async () => {
    const currentResultQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({
        id: 'result-1',
        fileId: 'file-1',
        interpretationStatus: 'proposed',
        supersededBy: null,
      })),
    };
    const resultRepository = { createQueryBuilder: jest.fn(() => currentResultQueryBuilder) };
    const manager = { getRepository: jest.fn(() => resultRepository) };
    const interpretation = { proposeFile: jest.fn(), modelName: 'test-model' };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      interpretation as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.interpret('result-1', 101)).rejects.toBeInstanceOf(ConflictException);
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });

  it('leaves a pending result retryable when OpenAI interpretation fails', async () => {
    const pending = {
      id: 'result-1',
      fileId: 'file-1',
      versionNumber: 1,
      interpretationStatus: 'pending',
      supersededBy: null,
    };
    const currentResultQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => pending),
    };
    const latestResultQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => pending),
    };
    const file = { id: 'file-1', uploadedBy: '101', objectKey: 'medical/file-1' };
    const fileQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => file),
    };
    const resultRepository = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValueOnce(currentResultQueryBuilder)
        .mockReturnValueOnce(latestResultQueryBuilder),
      save: jest.fn(),
    };
    const fileRepository = { createQueryBuilder: jest.fn(() => fileQueryBuilder) };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalFile | typeof MedicalResult) =>
        entity === MedicalFile ? fileRepository : resultRepository,
      ),
    };
    const storage = { downloadFile: jest.fn(async (key: string) => (void key, Buffer.from('%PDF-1.7'))) };
    const interpretation = {
      proposeFile: jest.fn(async () => Promise.reject(new Error('OpenAI unavailable'))),
      modelName: 'test-model',
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      storage as never,
      interpretation as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.interpret('result-1', 101)).rejects.toThrow('OpenAI unavailable');
    expect(pending.interpretationStatus).toBe('pending');
    expect(resultRepository.save).not.toHaveBeenCalled();
    expect(storage.downloadFile).toHaveBeenCalledWith('medical/file-1');
  });

  it('rejects a pending result superseded by a newer version', async () => {
    const currentResultQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({
        id: 'result-old',
        fileId: 'file-1',
        interpretationStatus: 'pending',
        supersededBy: 'result-new',
      })),
    };
    const resultRepository = { createQueryBuilder: jest.fn(() => currentResultQueryBuilder) };
    const manager = { getRepository: jest.fn(() => resultRepository) };
    const interpretation = { proposeFile: jest.fn(), modelName: 'test-model' };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      interpretation as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.interpret('result-old', 101)).rejects.toBeInstanceOf(ConflictException);
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });

  it('keeps interpretation owner-only', async () => {
    const pending = {
      id: 'result-1',
      fileId: 'file-1',
      interpretationStatus: 'pending',
      supersededBy: null,
    };
    const currentResultQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => pending),
    };
    const fileQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ id: 'file-1', uploadedBy: '202' })),
    };
    const manager = {
      getRepository: jest.fn((entity: typeof MedicalFile | typeof MedicalResult) =>
        entity === MedicalFile
          ? { createQueryBuilder: () => fileQueryBuilder }
          : { createQueryBuilder: () => currentResultQueryBuilder },
      ),
    };
    const interpretation = { proposeFile: jest.fn(), modelName: 'test-model' };
    const service = new RecordsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      interpretation as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.interpret('result-1', 101)).rejects.toBeInstanceOf(ForbiddenException);
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });
});
