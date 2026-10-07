import { z } from 'zod';
import { containsRecognizableContact, interestKey, interestSchema } from '../matchmaking/index.js';

const publicText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) => !containsRecognizableContact(value),
      'Public capsules cannot contain email addresses, phone numbers, or links.',
    );

/** Parsed capsules are normalized; signature verification must preserve the original signed bytes. */
export const agentCapsuleSchema = z
  .object({
    alias: publicText(1, 60),
    intents: z
      .array(z.enum(['friendship', 'dating', 'collaboration']))
      .min(1)
      .max(3)
      .refine((list) => new Set(list).size === list.length, 'Choose each public intention once.'),
    interests: z
      .array(interestSchema)
      .max(12)
      .refine(
        (list) => new Set(list.map(interestKey)).size === list.length,
        'Choose each public interest once, regardless of capitalization.',
      ),
    purpose: publicText(1, 240),
  })
  .strict();

export const agentRegistrationIdSchema = z.string().uuid();
