import express, { type Request, type Response } from 'express';
import type { ApiErrorBody, ChatRequest, Coordinates } from '../shared/orca-contract.js';
import { defaultDeps, orchestrate, type OrchestratorDeps } from './orchestrator.js';
import { ProviderError, isLiveSource } from './providers/types.js';
import { isLiveAdvisorySource } from './safety/types.js';
import { isLiveEcosystemSource } from './ecosystem/types.js';

export const API_VERSION = '1.0.0';
const MAX_MESSAGE = 500;
const MAX_LOCATION = 120;
const DEFAULT_LOCATION = 'Your Fishing Area';

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function errorBody(
  code: ApiErrorBody['error']['code'],
  message: string,
): ApiErrorBody {
  return { error: { code, message } };
}

/** Optional GPS fix: absent, or a complete valid pair — nothing in between. */
function validateCoordinates(value: unknown): Coordinates | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('"coordinates" must be an object with latitude and longitude.');
  }
  const { latitude, longitude } = value as Record<string, unknown>;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    throw new ValidationError('"coordinates.latitude" must be a finite number.');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    throw new ValidationError('"coordinates.longitude" must be a finite number.');
  }
  if (latitude < -90 || latitude > 90) {
    throw new ValidationError('"coordinates.latitude" must be between -90 and 90.');
  }
  if (longitude < -180 || longitude > 180) {
    throw new ValidationError('"coordinates.longitude" must be between -180 and 180.');
  }
  return { latitude, longitude };
}

/** Strict validation — keeps malformed input out of the orchestrator. */
export function validateChatBody(body: unknown): ChatRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object.');
  }
  const { message, location, coordinates } = body as {
    message?: unknown;
    location?: unknown;
    coordinates?: unknown;
  };

  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new ValidationError('"message" is required and must be a non-empty string.');
  }
  if (message.trim().length > MAX_MESSAGE) {
    throw new ValidationError(`"message" must be ${MAX_MESSAGE} characters or fewer.`);
  }
  if (location !== undefined && typeof location !== 'string') {
    throw new ValidationError('"location" must be a string when provided.');
  }
  const cleanLocation = (location ?? '').trim();
  if (cleanLocation.length > MAX_LOCATION) {
    throw new ValidationError(`"location" must be ${MAX_LOCATION} characters or fewer.`);
  }
  const fix = validateCoordinates(coordinates);
  return {
    message: message.trim(),
    location: cleanLocation || DEFAULT_LOCATION,
    ...(fix ? { coordinates: fix } : {}),
  };
}

export function createApp(deps: OrchestratorDeps = defaultDeps()): express.Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: API_VERSION,
      dataSource: deps.provider.dataSource,
      live: isLiveSource(deps.provider.dataSource),
      advisorySource: deps.safety.advisorySource,
      advisoryLive: isLiveAdvisorySource(deps.safety.advisorySource),
      ecosystemSource: deps.ecosystem.ecosystemSource,
      ecosystemLive: isLiveEcosystemSource(deps.ecosystem.ecosystemSource),
      ecosystemDataset: deps.ecosystem.dataset,
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    let chat: ChatRequest;
    try {
      chat = validateChatBody(req.body);
    } catch (err) {
      res
        .status(400)
        .json(errorBody('INVALID_REQUEST', err instanceof Error ? err.message : 'Invalid request.'));
      return;
    }

    try {
      const answer = await orchestrate(chat, deps);
      res.json(answer);
    } catch (err) {
      if (err instanceof ProviderError) {
        // eslint-disable-next-line no-console
        console.error(`[orca] provider failure (${err.provider}): ${err.message}`);
        res
          .status(502)
          .json(
            errorBody(
              'PROVIDER_UNAVAILABLE',
              'ORCA could not reach its marine data right now. Please try again shortly.',
            ),
          );
        return;
      }
      // eslint-disable-next-line no-console
      console.error(`[orca] internal error: ${err instanceof Error ? err.stack ?? err.message : err}`);
      res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong. Please try again.'));
    }
  });

  // Unknown /api/* routes → JSON 404 (kept separate from the SPA fallback in index.ts).
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json(errorBody('NOT_FOUND', 'Unknown API route.'));
  });

  return app;
}
