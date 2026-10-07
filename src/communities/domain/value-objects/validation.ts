import { z } from 'zod';
import {
  containsRecognizableContact,
  interestKey,
  interestSchema,
} from '../../../matchmaking/index.js';
import type { Circle, CircleApplication } from '../entities/index.js';

const unique = <T>(items: T[]) => new Set(items).size === items.length;
const publicText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (text) => !containsRecognizableContact(text),
      'Keep recognizable contact details out of circle disclosures.',
    );
const interests = z
  .array(interestSchema)
  .min(1)
  .max(12)
  .refine((items) => new Set(items.map(interestKey)).size === items.length);

export const circleSchema = z
  .object({
    id: publicText(120),
    name: publicText(80),
    kind: z.enum(['social', 'networking', 'creative']),
    city: publicText(100).nullable(),
    description: publicText(400),
    hostAgentName: publicText(60),
    interests,
    availability: z
      .array(z.enum(['weekday-evenings', 'weekends', 'weekday-days']))
      .min(1)
      .max(3)
      .refine(unique),
    minimumAge: z.number().int().min(18).max(120),
    requiredIntent: z.enum(['friendship', 'dating', 'collaboration']).nullable(),
    requiredCredential: publicText(80).nullable(),
    paid: z.boolean(),
  })
  .strict();

export const circleApplicationSchema = z
  .object({
    id: z.string().uuid(),
    circleId: publicText(120),
    profileFingerprint: z.string().regex(/^local-profile-v1-[a-f0-9]{16}$/),
    circleFingerprint: z.string().regex(/^local-circle-v1-[a-f0-9]{16}$/),
    state: z.enum(['pending-organizer', 'member', 'declined', 'withdrawn']),
    ownerApproved: z.boolean(),
    organizerApproved: z.boolean(),
    disclosures: z
      .object({
        alias: publicText(60),
        purpose: publicText(160),
        city: publicText(100).optional(),
        interests,
      })
      .strict(),
  })
  .strict()
  .superRefine((application, ctx) => {
    const valid =
      application.state === 'pending-organizer'
        ? application.ownerApproved && !application.organizerApproved
        : application.state === 'member'
          ? application.ownerApproved && application.organizerApproved
          : !application.ownerApproved && !application.organizerApproved;
    if (!valid)
      ctx.addIssue({ code: 'custom', message: 'Application consent does not match its state.' });
  });

export function validateCircle(input: unknown): Circle {
  return circleSchema.parse(input) as Circle;
}

/** Validate an allowlisted persisted record; membership requires two explicit demo consents. */
export function validateCircleApplication(input: unknown): CircleApplication {
  return circleApplicationSchema.parse(input) as CircleApplication;
}
