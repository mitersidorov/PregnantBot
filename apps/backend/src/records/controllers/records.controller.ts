import { Body, Controller, Get, HttpCode, Param, Post, Res, UploadedFile, UseInterceptors, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import type { AuthorizedRequest } from '../../auth/guards/telegram-init-data.guard';
import { ConfirmResultDto } from '../dto/confirm-result.dto';
import { RecordsService } from '../services/records.service';
import type { UploadedMedicalFile } from '../types/uploaded-medical-file.interface';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { MedicalFileResponseDto, MedicalResultResponseDto, UploadResponseDto } from '../dto/record-response.dto';

@ApiTags('records')
@ApiResponse({ status: 400, description: 'Invalid request; common error envelope.', type: ErrorResponseDto })
@ApiResponse({ status: 401, description: 'Missing or invalid API key / Telegram initData.', type: ErrorResponseDto })
@ApiResponse({
  status: 403,
  description: 'Only the uploader may interpret or confirm this result.',
  type: ErrorResponseDto,
})
@ApiResponse({ status: 404, description: 'File or result not found.', type: ErrorResponseDto })
@ApiResponse({
  status: 409,
  description: 'Result has already been confirmed or conflicts with its current state.',
  type: ErrorResponseDto,
})
@ApiResponse({ status: 500, description: 'Storage/provider error; common error envelope.', type: ErrorResponseDto })
@Controller('records')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload a private PDF/JPEG/PNG medical document (maximum 20 MB).' })
  @ApiResponse({
    status: 201,
    description: 'Private file metadata and a pending result ready for explicit interpretation.',
    type: UploadResponseDto,
  })
  @ApiResponse({ status: 413, description: 'Upload exceeds 20 MiB.', type: ErrorResponseDto })
  @ApiResponse({ status: 415, description: 'Unsupported or spoofed media type.', type: ErrorResponseDto })
  upload(@UploadedFile() file: UploadedMedicalFile, @Req() request: AuthorizedRequest) {
    return this.service.upload(file, request.telegramUser.id);
  }
  @Get()
  @ApiOperation({ summary: 'List uploaded files, all result versions, and confirmed requirement links.' })
  @ApiResponse({
    status: 200,
    description: 'Files and their result versions, including unclassified results.',
    type: MedicalFileResponseDto,
    isArray: true,
  })
  list() {
    return this.service.list();
  }

  @Get('archive')
  @ApiOperation({ summary: 'Download all authorized users’ files as a private ZIP archive.' })
  @ApiResponse({ status: 200, description: 'Streaming ZIP archive.' })
  async archive(@Res() response: Response) {
    const archive = await this.service.archive();
    response.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="pregnantbot-records.zip"',
    });
    return archive.pipe(response);
  }
  @Get(':id/download')
  @ApiOperation({ summary: 'Stream a private file through this authenticated API response.' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({
    status: 200,
    description: 'Private file bytes with the original filename in Content-Disposition.',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  async download(@Param('id') id: string, @Res() response: Response) {
    const { file, stream } = await this.service.downloadStream(id);
    const fileName = file.originalName.replace(/[\\/\r\n]/g, '_').slice(0, 255);
    const asciiFileName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    response.status(200).set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return stream.pipe(response);
  }
  @Post('results/:id/interpret')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Interpret the latest pending result in place as a Zod-validated proposal; does not link checklist requirements.',
  })
  @ApiResponse({
    status: 200,
    description: 'The same result updated to proposed; no new version or requirement links are added.',
    type: MedicalResultResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Result is not the current pending version.', type: ErrorResponseDto })
  @ApiResponse({ status: 503, description: 'OpenAI interpretation is unavailable or failed.', type: ErrorResponseDto })
  interpret(@Param('id') id: string, @Req() request: AuthorizedRequest) {
    return this.service.interpret(id, request.telegramUser.id);
  }
  @Post('results/:id/confirm')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm proposed result fields and explicitly chosen requirement links.' })
  @ApiResponse({
    status: 200,
    description: 'Confirmed result and user-selected requirement links.',
    type: MedicalResultResponseDto,
  })
  confirm(@Param('id') id: string, @Body() dto: ConfirmResultDto, @Req() request: AuthorizedRequest) {
    return this.service.confirm(id, dto, request.telegramUser.id, request.patientRole);
  }
}
