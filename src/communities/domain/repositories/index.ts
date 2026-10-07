import type { Circle } from '../entities/index.js';

/** A later shared-circle adapter must enforce independently verified organizer policy. */
export interface CircleRepository {
  listCircles(): readonly Circle[];
  findCircle(id: string): Circle | undefined;
}
