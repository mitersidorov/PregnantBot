import { Body, Controller, Param, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import type { AuthorizedRequest } from '../../auth/guards/telegram-init-data.guard';
import { ChecklistProgressResponseDto } from '../dto/checklist-progress-response.dto';
import { UpdateProgressDto } from '../dto/update-progress.dto';
import { ChecklistService } from '../services/checklist.service';

@ApiTags('checklist')
@ApiBearerAuth('api-key')
@ApiBearerAuth('telegram-init-data')
@ApiResponse({ status: 400, description: 'Validation failed; common error envelope.', type: ErrorResponseDto })
@ApiResponse({ status: 401, description: 'Missing or invalid API key / Telegram initData.', type: ErrorResponseDto })
@ApiResponse({ status: 403, description: 'Authenticated role cannot update this requirement.', type: ErrorResponseDto })
@ApiResponse({ status: 404, description: 'Attempt or requirement not found.', type: ErrorResponseDto })
@ApiResponse({ status: 500, description: 'Unexpected error; common error envelope.', type: ErrorResponseDto })
@Controller('cycles/:cycleId/checklist')
export class ChecklistController {
  constructor(private readonly service: ChecklistService) {}

  @Patch(':requirementId')
  @ApiOperation({ summary: 'Update progress for a requirement in an attempt checklist.' })
  @ApiResponse({ status: 200, description: 'Updated checklist progress.', type: ChecklistProgressResponseDto })
  update(
    @Param('cycleId') cycleId: string,
    @Param('requirementId') requirementId: string,
    @Body() dto: UpdateProgressDto,
    @Req() request: AuthorizedRequest,
  ) {
    return this.service.updateProgressForRole(cycleId, requirementId, dto.status, request.patientRole);
  }
}
