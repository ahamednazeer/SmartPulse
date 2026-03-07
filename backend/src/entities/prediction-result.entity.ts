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

@Entity('prediction_results')
@Index(['user', 'date'], { unique: true })
export class PredictionResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Date this prediction represents (YYYY-MM-DD)
  @Column({ type: 'text' })
  date: string;

  // Final ensemble risk score (0-100)
  @Column({ type: 'real' })
  riskScore: number;

  // Classification bucket: LOW | MODERATE | HIGH
  @Column({ type: 'text' })
  riskLevel: string;

  // Per-model risk outputs for auditability (0-100)
  @Column({ type: 'real', default: 0 })
  randomForestScore: number;

  @Column({ type: 'real', default: 0 })
  extraTreesScore: number;

  @Column({ type: 'real', default: 0 })
  svmScore: number;

  // Engineered feature vector JSON
  @Column({ type: 'text', nullable: true })
  featureVectorJson: string;

  // Optional generated insights JSON
  @Column({ type: 'text', nullable: true })
  insightsJson: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
