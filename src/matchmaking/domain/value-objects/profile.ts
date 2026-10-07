import { z } from 'zod';
import { INTERESTS, VALUES, type OwnerProfile } from '../../../shared/types.js';

const genders = ['woman', 'man', 'nonbinary', 'self-described'] as const;
const intents = ['friendship', 'dating', 'collaboration'] as const;
const availability = ['weekday-evenings', 'weekends', 'weekday-days'] as const;
const cleanText = (min: number, max: number) => z.string().trim().min(min).max(max);
const unique = <T>(items: T[]) => new Set(items).size === items.length;

/** Pattern check for recognizable contacts, not a guarantee against obfuscated details. */
export function containsRecognizableContact(value: string): boolean {
  const text = value.normalize('NFKC');
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/u.test(text)) return true;
  if (/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+/iu.test(text)) return true;
  if (
    /\b[a-z\d](?:[a-z\d-]*[a-z\d])?\.(?:com|org|net|io|co|app|me|dev|ai|info|biz|tv|cc|xyz|social|dating|online|site|world|chat|community|network|cloud|tech|live|page|space|store|website|uk|ca|us)\b/iu.test(
      text,
    )
  )
    return true;
  for (const match of text.matchAll(
    /(?:^|[^\p{L}\p{N}])(\+?\d[\d\s().-]{5,}\d)(?=$|[^\p{L}\p{N}])/gu,
  )) {
    const candidate = match[1].trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(candidate)) continue;
    if (candidate.replace(/\D/g, '').length >= 7) return true;
  }
  return false;
}

const publicText = (min: number, max: number) =>
  cleanText(min, max).refine(
    (text) => !containsRecognizableContact(text),
    'Keep email addresses, phone numbers, and links out of public profile fields.',
  );

/** Comparison key for owner-supplied soft labels; this never creates an admission rule. */
export function interestKey(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

const builtinInterests = new Map(INTERESTS.map((label) => [interestKey(label), label]));

/** Public, owner-selected label. Contact pattern checks cannot detect every obfuscation. */
export const interestSchema = z
  .string()
  .transform((text) => text.normalize('NFKC').trim().replace(/\s+/gu, ' '))
  .pipe(
    z
      .string()
      .min(1)
      .max(48)
      .refine(
        (text) => !containsRecognizableContact(text),
        'Keep email addresses, phone numbers, and links out of public interests.',
      ),
  )
  .transform((text) => builtinInterests.get(interestKey(text)) ?? text);

/** The owner supplies policy; the HTTP adapter supplies the trusted identity. */
export const ownerProfileSchema = z
  .object({
    id: cleanText(1, 100),
    name: publicText(1, 60),
    age: z.number().int().min(18).max(120),
    city: publicText(1, 100),
    bio: publicText(1, 320),
    agentName: publicText(1, 60),
    gender: z.enum(genders),
    intents: z.array(z.enum(intents)).min(1).max(3).refine(unique, 'Choose each intention once.'),
    interests: z
      .array(interestSchema)
      .min(1)
      .max(12)
      .refine(
        (items) => new Set(items.map(interestKey)).size === items.length,
        'Choose each interest once, regardless of capitalization.',
      ),
    values: z
      .array(z.enum(VALUES as [string, ...string[]]))
      .min(1)
      .max(6)
      .refine(unique, 'Choose each value once.'),
    availability: z
      .array(z.enum(availability))
      .min(1)
      .max(3)
      .refine(unique, 'Choose each availability once.'),
    energy: z.enum(['quiet', 'balanced', 'outgoing']),
    requirements: z
      .object({
        minAge: z.number().int().min(18).max(120),
        maxAge: z.number().int().min(18).max(120),
        sameCity: z.boolean(),
        nonsmoker: z.boolean(),
        datingGenders: z.array(z.enum(genders)).max(4).refine(unique, 'Choose each gender once.'),
      })
      .refine((policy) => policy.minAge <= policy.maxAge, {
        message: 'Minimum age must be no greater than maximum age.',
        path: ['maxAge'],
      }),
    smoking: z.boolean(),
    boundaries: cleanText(0, 1000),
    paused: z.boolean(),
  })
  .superRefine((profile, ctx) => {
    if (profile.intents.includes('dating') && profile.requirements.datingGenders.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose at least one gender for dating.',
        path: ['requirements', 'datingGenders'],
      });
    }
  });

/** Reject malformed profiles. Unknown fields are stripped, never copied to peers. */
export function validateProfile(input: unknown): OwnerProfile {
  return ownerProfileSchema.parse(input) as OwnerProfile;
}

export function normalizedCity(city: string): string {
  return city.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
