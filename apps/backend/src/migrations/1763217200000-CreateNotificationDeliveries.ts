import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationDeliveries1763217200000 implements MigrationInterface {
  name = 'CreateNotificationDeliveries1763217200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE notification_deliveries (
        id char(36) NOT NULL PRIMARY KEY,
        idempotency_key varchar(255) NOT NULL,
        recipient_telegram_id varchar(32) NOT NULL,
        event_type varchar(32) NOT NULL,
        status varchar(20) NOT NULL,
        error_code varchar(64) NULL,
        sent_at datetime NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT UQ_notification_delivery_idempotency_key UNIQUE (idempotency_key)
      ) ENGINE=InnoDB`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE notification_deliveries');
  }
}
