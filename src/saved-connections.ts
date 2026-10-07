import { z } from 'zod';
import { containsRecognizableContact } from './matchmaking';
import type { SavedConnection } from './shared/types';

export const savedConnectionSchema = z
  .object({
    peerId: z.string().regex(/^[a-f0-9]{64}$/),
    alias: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(
        (text) => !containsRecognizableContact(text),
        'Keep contact details out of saved aliases.',
      ),
    conversationId: z.string().uuid(),
    relayURL: z
      .string()
      .trim()
      .max(300)
      .url()
      .refine((text) => {
        const url = new URL(text);
        return (
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (url.protocol === 'https:' ||
            (url.protocol === 'http:' &&
              ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
        );
      }, 'Use an HTTPS relay or a loopback relay.'),
    savedAt: z.iso.datetime(),
  })
  .strict();

export function validateSavedConnection(input: unknown): SavedConnection {
  return savedConnectionSchema.parse(input);
}
