import rateLimit from 'express-rate-limit';
import { appConfig } from '../../config';

export const apiRateLimiter = rateLimit({
  windowMs: appConfig.rateLimitWindowMs,
  max: appConfig.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false
});
