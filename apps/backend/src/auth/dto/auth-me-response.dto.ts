import { ApiProperty } from '@nestjs/swagger';

export class AuthMeResponseDto {
  @ApiProperty({ enum: ['wife', 'husband'], example: 'wife' })
  patientRole: 'wife' | 'husband';

  @ApiProperty({ type: String, example: '101', description: 'Telegram ID attached to this authenticated request.' })
  telegramUserId: string;
}
