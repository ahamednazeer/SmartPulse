import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('survey_responses')
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // Stress Level (1-10)
  @Column({ type: 'integer' })
  stressLevel: number;

  // Anxiety Level (1-10)
  @Column({ type: 'integer' })
  anxietyLevel: number;

  // Depression Indicators (1-10)
  @Column({ type: 'integer' })
  depressionLevel: number;

  // Sleep Quality (1-10, 10 = excellent)
  @Column({ type: 'integer' })
  sleepQuality: number;

  // Average sleep hours
  @Column({ type: 'real' })
  sleepHours: number;

  // Social Interaction Level (1-10, 10 = very social)
  @Column({ type: 'integer' })
  socialInteraction: number;

  // Daily Productivity (1-10)
  @Column({ type: 'integer' })
  dailyProductivity: number;

  // Emotional Dependence on Phone (1-10, 10 = extremely dependent)
  @Column({ type: 'integer' })
  phoneDependence: number;

  // Mood (1-5: 1=Very Bad, 2=Bad, 3=Neutral, 4=Good, 5=Very Good)
  @Column({ type: 'integer' })
  mood: number;

  // Free-text notes (optional)
  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}
