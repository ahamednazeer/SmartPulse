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

@Entity('feature_store_records')
@Index(['user', 'date'], { unique: true })
export class FeatureStoreRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Dataset date this feature snapshot represents (YYYY-MM-DD)
  @Column({ type: 'text' })
  date: string;

  // Final engineered ML feature map (selected + required)
  @Column({ type: 'text' })
  featureVectorJson: string;

  // Normalized feature map used for model scoring
  @Column({ type: 'text' })
  normalizedFeaturesJson: string;

  // Feature selection metadata
  @Column({ type: 'text', nullable: true })
  featureSelectionJson: string;

  // Data quality / cleaning metadata
  @Column({ type: 'text', nullable: true })
  qualityJson: string;

  // Derived target class for supervised training (LOW | MODERATE | HIGH)
  @Column({ type: 'text' })
  addictionLabel: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
