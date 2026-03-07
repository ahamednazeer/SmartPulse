import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Date this record covers (YYYY-MM-DD)
  @Column({ type: 'text' })
  date: string;

  // Total screen time in minutes
  @Column({ type: 'real', default: 0 })
  screenTimeMinutes: number;

  // Number of phone unlocks
  @Column({ type: 'integer', default: 0 })
  unlockCount: number;

  // App usage breakdown (JSON: { "appName": minutesUsed })
  @Column({ type: 'text', nullable: true })
  appUsageJson: string;

  // Social media usage in minutes
  @Column({ type: 'real', default: 0 })
  socialMediaMinutes: number;

  // Night-time usage in minutes (10pm - 6am)
  @Column({ type: 'real', default: 0 })
  nightUsageMinutes: number;

  // Peak usage hour (0-23)
  @Column({ type: 'integer', nullable: true })
  peakUsageHour: number;

  // Longest continuous session in minutes
  @Column({ type: 'real', default: 0 })
  longestSessionMinutes: number;

  // Number of notifications received
  @Column({ type: 'integer', default: 0 })
  notificationCount: number;

  // 15-minute category timeline (JSON)
  @Column({ type: 'text', nullable: true })
  appCategoryTimelineJson: string | null;

  // Session events stream (JSON)
  @Column({ type: 'text', nullable: true })
  sessionEventsJson: string | null;

  // Notification interaction telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  notificationInteractionJson: string | null;

  // Sleep proxy telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  sleepProxyJson: string | null;

  // Activity context telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  activityContextJson: string | null;

  // Charging and battery telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  batteryContextJson: string | null;

  // Connectivity telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  connectivityContextJson: string | null;

  // Coarse location context telemetry (JSON)
  @Column({ type: 'text', nullable: true })
  locationContextJson: string | null;

  // User micro check-ins (JSON array)
  @Column({ type: 'text', nullable: true })
  microCheckinsJson: string | null;

  // Intervention adherence/outcomes (JSON array)
  @Column({ type: 'text', nullable: true })
  interventionOutcomesJson: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
