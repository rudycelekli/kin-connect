import type { CandidateRepository } from '../domain/repositories/index.js';
import { fixtureProfiles } from './fixtures.js';

export class FictionalCandidateRepository implements CandidateRepository {
  listCandidates() {
    return fixtureProfiles;
  }
}
