import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('notification_deliveries')
@Unique('UQ_notification_delivery_idempotency_key', ['idempotencyKey'])
export class NotificationDelivery {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 }) idempotencyKey: string;
  @Column({ name: 'recipient_telegram_id', type: 'varchar', length: 32 }) recipientTelegramId: string;
  @Column({ name: 'event_type', type: 'varchar', length: 32 }) eventType: string;
  @Column({ type: 'varchar', length: 20 }) status: 'claimed' | 'sent' | 'failed' | 'retryable';
  @Column({ name: 'error_code', type: 'varchar', length: 64, nullable: true }) errorCode: string | null;
  @Column({ name: 'sent_at', type: 'datetime', nullable: true }) sentAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime' }) createdAt: Date;
}
