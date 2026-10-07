import type { OwnerProfile } from '../../../shared/types.js';

/** Real federation adapters must obtain independently authorized public cards. */
export interface CandidateRepository {
  listCandidates(): readonly OwnerProfile[];
}
