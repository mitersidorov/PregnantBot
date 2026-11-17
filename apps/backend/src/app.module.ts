import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlingModule } from './common/throttling/throttling.module';
import { DatabaseModule } from './common/database/database.module';
import { S3Module } from './common/s3/s3.module';
import { ErrorModule } from './common/error/error.module';
import { HealthModule } from './health/health.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CyclesModule } from './cycles/cycles.module';
import { RecordsModule } from './records/records.module';
import { NotificationsModule } from './notifications/notifications.module';

// Composes the backend infrastructure and protected API modules.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    ThrottlingModule,
    DatabaseModule,
    S3Module,
    ErrorModule,
    HealthModule,
    CyclesModule,
    RecordsModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
