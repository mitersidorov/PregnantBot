import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MedicalFile } from '../entities/medical-file.entity';
import { MedicalResult } from '../entities/medical-result.entity';
import { Requirement } from '../../checklist/entities/requirement.entity';
import { RecordsService } from './records.service';

describe('RecordsService uploads', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
      {
        buffer: Buffer.from('arbitrary content'),
        size: 17,
        mimetype: 'application/x-custom',
        originalname: 'result.data',
      } as never,
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
    expect(storage.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'application/x-custom' }));
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });

  it('does not let the husband select a wife-only checklist item', async () => {
    const result = {
      id: 'result-1',
      fileId: 'file-1',
      testName: 'Группа крови, резус-фактор',
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
    const requirement = {
      id: 'wife-rh',
      name: 'Blood group and Rh factor',
      patientApplicability: 'wife',
    };
    const requirementRepository = { findByIds: jest.fn(async () => [requirement]) };
    const fileRepository = { findOneBy: jest.fn(async () => ({ id: 'file-1', uploadedBy: '202' })) };
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
    await expect(service.confirm('result-1', { requirementIds: ['wife-rh'] }, 202, 'husband')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(checklist.applyConfirmedResult).not.toHaveBeenCalled();
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

  it('matches the live multipage PDF to both checklist roles for the husband uploader', async () => {
    const file = {
      id: 'file-1',
      uploadedBy: '202',
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
    const findings = [
      { testName: 'Общий анализ мочи', resultDate: '2026-11-15', summary: null, pageNumber: 1 },
      { testName: 'Гинекологический мазок (анализ на флору)', resultDate: null, summary: null, pageNumber: 2 },
      { testName: 'Общий анализ крови', resultDate: null, summary: null, pageNumber: 4 },
      {
        testName: 'ВИЧ (комбинированные антитела к ВИЧ и антигену Р24 в крови)',
        resultDate: null,
        summary: null,
        pageNumber: 6,
      },
      { testName: 'Коагулограмма (ПТИ)', resultDate: null, summary: null, pageNumber: 6 },
      { testName: 'Коагулограмма (PT)', resultDate: null, summary: null, pageNumber: 6 },
      { testName: 'Коагулограмма (ИНР)', resultDate: null, summary: null, pageNumber: 7 },
      { testName: 'Коагулограмма (aPTT)', resultDate: null, summary: null, pageNumber: 7 },
      { testName: 'Биохимический анализ крови (глюкоза)', resultDate: null, summary: null, pageNumber: 8 },
      { testName: 'Сифилис (anti-Treponema pallidum в крови)', resultDate: null, summary: null, pageNumber: 8 },
      { testName: 'Гепатит B (поверхностный антиген HBsAg)', resultDate: null, summary: null, pageNumber: 8 },
      { testName: 'Гепатит C (antiHCV, антитела в крови)', resultDate: null, summary: null, pageNumber: 8 },
      { testName: 'Группа крови, резус-фактор', resultDate: null, summary: null, pageNumber: 9 },
    ];
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
    let sentRequirements: { id: string; name: string }[] = [];
    const interpretation = {
      proposeFile: jest.fn(
        async (
          _bytes: Buffer,
          _fileName: string,
          _contentType: string,
          requirements: { id: string; name: string }[],
        ) => {
          sentRequirements = requirements;
          return {
            testName: findings[0].testName,
            resultDate: '2026-11-15',
            summary: 'Updated',
            pageNumber: 1,
            findings,
          };
        },
      ),
      modelName: 'test-model',
    };
    const checklist = { resetActiveProgressForResult: jest.fn() };
    const requirementRepository = {
      find: jest.fn(async (options: unknown) => {
        void options;
        return [
          { id: 'w-urine', name: 'Urinalysis', patientApplicability: 'wife', active: true },
          { id: 'w-flora', name: 'Flora smear', patientApplicability: 'wife', active: true },
          { id: 'w-cbc', name: 'Complete blood count (CBC)', patientApplicability: 'wife', active: true },
          { id: 'w-hiv', name: 'Combined HIV Ag/Ab + P24', patientApplicability: 'wife', active: true },
          { id: 'w-pti', name: 'PTI (prothrombin index)', patientApplicability: 'wife', active: true },
          { id: 'w-inr', name: 'INR', patientApplicability: 'wife', active: true },
          { id: 'w-aptt', name: 'APTT', patientApplicability: 'wife', active: true },
          { id: 'w-glucose', name: 'Glucose', patientApplicability: 'wife', active: true },
          { id: 'w-syphilis', name: 'anti-Treponema', patientApplicability: 'wife', active: true },
          { id: 'w-hbsag', name: 'HBsAg', patientApplicability: 'wife', active: true },
          { id: 'w-hcv', name: 'anti-HCV', patientApplicability: 'wife', active: true },
          { id: 'w-rh', name: 'Blood group and Rh factor', patientApplicability: 'wife', active: true },
          { id: 'h-hiv', name: 'HIV Ag/Ab + P24', patientApplicability: 'husband', active: true },
          { id: 'h-syphilis', name: 'Syphilis (anti-Treponema)', patientApplicability: 'husband', active: true },
          { id: 'h-hbsag', name: 'HBsAg', patientApplicability: 'husband', active: true },
          { id: 'h-hcv', name: 'anti-HCV', patientApplicability: 'husband', active: true },
          { id: 'h-rh', name: 'Blood group and Rh factor', patientApplicability: 'husband', active: true },
        ].filter(({ patientApplicability }) => patientApplicability === 'husband');
      }),
    };
    const service = new RecordsService(
      {} as never,
      {} as never,
      requirementRepository as never,
      storage as never,
      interpretation as never,
      dataSource as never,
      checklist as never,
    );

    const matchedIdsByIndex: Record<number, string[]> = {
      3: ['h-hiv', 'w-hiv'],
      9: ['h-syphilis', 'w-syphilis'],
      10: ['h-hbsag', 'w-hbsag'],
      11: ['h-hcv', 'w-hcv'],
      12: ['h-rh', 'w-rh'],
    };
    findings.forEach((finding, index) => Object.assign(finding, { requirementIds: matchedIdsByIndex[index] ?? [] }));
    const interpreted = await service.interpret('result-1', 202, 'husband');

    expect(interpreted).toMatchObject({
      id: 'result-1',
      versionNumber: 1,
      interpretationStatus: 'proposed',
      testName: findings[0].testName,
      resultDate: '2026-11-15',
      supersededBy: null,
      requirements: [],
      extractedFindings: findings.map((finding) => ({
        ...finding,
        requirementIds: ((finding as { requirementIds?: string[] }).requirementIds ?? []).filter((requirementId) =>
          requirementId.startsWith('h-'),
        ),
      })),
    });
    expect(interpreted.matchedFindings).toHaveLength(5);
    expect(
      interpreted.matchedFindings.map(({ testName, pageNumber, requirementIds }) => ({
        testName,
        pageNumber,
        requirementIds,
      })),
    ).toEqual([
      { testName: findings[3].testName, pageNumber: 6, requirementIds: ['h-hiv'] },
      { testName: findings[9].testName, pageNumber: 8, requirementIds: ['h-syphilis'] },
      { testName: findings[10].testName, pageNumber: 8, requirementIds: ['h-hbsag'] },
      { testName: findings[11].testName, pageNumber: 8, requirementIds: ['h-hcv'] },
      { testName: findings[12].testName, pageNumber: 9, requirementIds: ['h-rh'] },
    ]);
    expect(requirementRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          { active: true, patientApplicability: 'husband' },
          { active: true, patientApplicability: 'both' },
        ]),
      }),
    );
    expect(resultRepository.save).toHaveBeenCalledTimes(1);
    expect(sentRequirements).toEqual(
      expect.arrayContaining([
        { id: 'h-hiv', name: 'HIV Ag/Ab + P24' },
        { id: 'h-rh', name: 'Blood group and Rh factor' },
      ]),
    );
    expect(sentRequirements).not.toEqual(expect.arrayContaining([{ id: 'w-rh', name: 'Blood group and Rh factor' }]));
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

    await expect(service.interpret('result-1', 101, 'wife')).rejects.toBeInstanceOf(ConflictException);
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
      { find: jest.fn(async () => []) } as never,
      storage as never,
      interpretation as never,
      { transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager) } as never,
      {} as never,
    );

    await expect(service.interpret('result-1', 101, 'wife')).rejects.toThrow('OpenAI unavailable');
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

    await expect(service.interpret('result-old', 101, 'wife')).rejects.toBeInstanceOf(ConflictException);
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

    await expect(service.interpret('result-1', 101, 'wife')).rejects.toBeInstanceOf(ForbiddenException);
    expect(interpretation.proposeFile).not.toHaveBeenCalled();
  });
});
