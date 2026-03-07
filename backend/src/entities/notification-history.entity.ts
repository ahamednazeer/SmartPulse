import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notification_history')
@Index(['user', 'date', 'type'], { unique: true })
export class NotificationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Trigger date (YYYY-MM-DD)
  @Column({ type: 'text' })
  date: string;

  // Type key for threshold/risk alerts
  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  severity: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  // Optional metadata JSON
  @Column({ type: 'text', nullable: true })
  metadataJson: string;

  @CreateDateColumn()
  createdAt: Date;
}
