import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthorizedRequest } from '../../auth/guards/telegram-init-data.guard';
import { CreateCycleDto } from '../dto/create-cycle.dto';
import { CyclesService } from '../services/cycles.service';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { CycleResponseDto } from '../dto/cycle-response.dto';

@ApiTags('cycles')
@ApiBearerAuth('api-key')
@ApiBearerAuth('telegram-init-data')
@ApiResponse({ status: 401, description: 'Missing or invalid API key / Telegram initData.', type: ErrorResponseDto })
@ApiResponse({ status: 400, description: 'Validation failed; common error envelope.', type: ErrorResponseDto })
@ApiResponse({ status: 403, description: 'Authenticated role cannot perform this operation.', type: ErrorResponseDto })
@ApiResponse({ status: 404, description: 'Cycle or requirement not found.', type: ErrorResponseDto })
@ApiResponse({ status: 500, description: 'Unexpected error; common error envelope.', type: ErrorResponseDto })
@Controller('cycles')
export class CyclesController {
  constructor(private readonly service: CyclesService) {}
  @Post()
  @ApiOperation({ summary: 'Start a stimulation cycle for the authenticated user; initialize its checklist.' })
  @ApiResponse({
    status: 201,
    description: 'Created cycle with initialized checklist progress.',
    type: CycleResponseDto,
  })
  create(@Body() dto: CreateCycleDto, @Req() request: AuthorizedRequest) {
    return this.service.create(dto.startDate, request.telegramUser.id);
  }
  @Get()
  @ApiOperation({ summary: 'List cycle history.' })
  @ApiResponse({ status: 200, description: 'Cycle history.', type: CycleResponseDto, isArray: true })
  list() {
    return this.service.list();
  }
  @Get(':id')
  @ApiOperation({ summary: 'Get cycle and per-cycle checklist progress.' })
  @ApiResponse({ status: 200, description: 'Cycle and checklist progress.', type: CycleResponseDto })
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete a stimulation cycle while retaining its checklist and history.' })
  @ApiResponse({ status: 200, description: 'Completed cycle with checklist history.', type: CycleResponseDto })
  complete(@Param('id') id: string, @Req() request: AuthorizedRequest) {
    if (request.patientRole !== 'wife') {
      throw new ForbiddenException('Only the wife can complete a stimulation cycle.');
    }
    return this.service.complete(id);
  }
}
