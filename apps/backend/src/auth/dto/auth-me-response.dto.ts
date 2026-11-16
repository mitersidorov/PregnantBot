import { ApiProperty } from '@nestjs/swagger';

export class AuthMeResponseDto {
  @ApiProperty({ enum: ['wife', 'husband'], example: 'wife' })
  patientRole: 'wife' | 'husband';
}
