import { validateCircle, type Circle } from '../domain/index.js';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Fictional browser-local fixtures: no live organizers, shared memberships, verification or billing. */
export const circleCatalog: readonly Circle[] = freeze(
  [
    {
      id: 'brooklyn-coffee-circle',
      name: 'Brooklyn Coffee Circle',
      kind: 'social',
      city: 'New York',
      description:
        'A fictional Brooklyn circle for weekend coffee, books and low-pressure conversation.',
      hostAgentName: 'Perk',
      interests: ['Coffee', 'Books'],
      availability: ['weekends'],
      minimumAge: 18,
      requiredIntent: 'friendship',
      requiredCredential: null,
      paid: false,
    },
    {
      id: 'makers-exchange',
      name: 'Makers Exchange',
      kind: 'creative',
      city: null,
      description:
        'A fictional creative circle for sharing ideas and making small projects together.',
      hostAgentName: 'Forge',
      interests: ['Technology', 'Art & design'],
      availability: ['weekday-evenings', 'weekends'],
      minimumAge: 18,
      requiredIntent: 'collaboration',
      requiredCredential: null,
      paid: false,
    },
    {
      id: 'founders-table',
      name: 'Founders Table',
      kind: 'networking',
      city: null,
      description:
        'A fictional professional circle. Verified access is a future feature and remains closed.',
      hostAgentName: 'Harbor',
      interests: ['Technology', 'Coffee'],
      availability: ['weekday-evenings', 'weekends'],
      minimumAge: 18,
      requiredIntent: 'collaboration',
      requiredCredential: 'professional-membership',
      paid: false,
    },
    {
      id: 'members-club',
      name: 'Members Club',
      kind: 'social',
      city: null,
      description:
        'A fictional paid club. Billing is a future feature and admission remains closed.',
      hostAgentName: 'Velvet',
      interests: ['Coffee', 'Books', 'Art & design'],
      availability: ['weekends'],
      minimumAge: 18,
      requiredIntent: 'friendship',
      requiredCredential: null,
      paid: true,
    },
  ].map((circle) => validateCircle(circle)),
);
