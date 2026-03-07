import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: false })
  screenUsageMonitoring: boolean;

  @Column({ default: false })
  appUsageStatistics: boolean;

  @Column({ default: false })
  notificationAccess: boolean;

  @Column({ default: false })
  backgroundActivityTracking: boolean;

  @OneToOne(() => User, (user) => user.permission)
  @JoinColumn()
  user: User;
}
