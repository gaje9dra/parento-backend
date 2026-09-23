import { z } from 'zod';

export type ValidationTarget = 'body' | 'query' | 'params';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  return schema.parse(input);
}

export function validationErrorMetadata(error: z.ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path,
      code: issue.code,
      message: issue.message,
    })),
  };
}
