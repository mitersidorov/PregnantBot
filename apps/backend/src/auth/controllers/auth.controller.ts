import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import type { AuthorizedRequest } from '../guards/telegram-init-data.guard';
import { AuthMeResponseDto } from '../dto/auth-me-response.dto';

@ApiTags('Authentication')
@ApiBearerAuth('api-key')
@ApiBearerAuth('telegram-init-data')
@Controller('auth')
export class AuthController {
  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated Telegram identity and patient role.' })
  @ApiResponse({ status: 200, description: 'Authenticated Telegram ID and patient role.', type: AuthMeResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key / Telegram initData.', type: ErrorResponseDto })
  getCurrentUser(@Req() request: AuthorizedRequest): AuthMeResponseDto {
    return { patientRole: request.patientRole, telegramUserId: String(request.telegramUser.id) };
  }
}
