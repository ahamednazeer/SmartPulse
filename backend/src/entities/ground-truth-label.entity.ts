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

@Entity('ground_truth_labels')
@Index(['user', 'date'], { unique: true })
export class GroundTruthLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Date this validated label represents (YYYY-MM-DD)
  @Column({ type: 'text' })
  date: string;

  // Clinically/externally validated risk class: LOW | MODERATE | HIGH
  @Column({ type: 'text' })
  label: string;

  // Label source, e.g. CLINICAL_ASSESSMENT, THERAPIST_REVIEW, SELF_ASSESSMENT
  @Column({ type: 'text', default: 'UNSPECIFIED' })
  source: string;

  // Optional confidence score in [0, 1]
  @Column({ type: 'real', nullable: true })
  confidence: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

