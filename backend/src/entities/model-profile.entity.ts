import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('model_profiles')
@Index(['user'], { unique: true })
export class ModelProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Selected ensemble weights JSON
  @Column({ type: 'text', nullable: true })
  weightsJson: string;

  // Grid-search summary JSON
  @Column({ type: 'text', nullable: true })
  searchSummaryJson: string;

  // Latest train/eval metrics JSON
  @Column({ type: 'text', nullable: true })
  metricsJson: string;

  // Learned model coefficients + normalization metadata JSON
  @Column({ type: 'text', nullable: true })
  learnedModelJson: string;

  // Data-driven feature importance JSON
  @Column({ type: 'text', nullable: true })
  featureImportanceJson: string;

  // Calibration and backtest diagnostics JSON
  @Column({ type: 'text', nullable: true })
  monitoringJson: string;

  @Column({ type: 'integer', default: 0 })
  trainedSampleCount: number;

  @Column({ type: 'text', nullable: true })
  trainedAtIso: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
