import { CanActivate, ExecutionContext, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { PUBLIC_ROUTE_METADATA } from '../../auth/decorators/public-route.decorator';

// Validates the X-API-KEY header against the API_KEY environment variable.
@Injectable()
export class ApiKeyGuard implements CanActivate, OnModuleInit {
  constructor(private readonly reflector: Reflector) {}

  onModuleInit(): void {
    if (!process.env.API_KEY?.trim()) throw new Error('API_KEY must be configured.');
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const validKey = process.env.API_KEY;

    const supplied = Array.isArray(providedKey) ? '' : (providedKey ?? '');
    const expectedDigest = createHash('sha256')
      .update(validKey ?? '')
      .digest();
    const suppliedDigest = createHash('sha256').update(supplied).digest();
    if (!supplied || !timingSafeEqual(expectedDigest, suppliedDigest)) {
      throw new UnauthorizedException({ message: 'Invalid or missing API key.', errorCode: 'INVALID_API_KEY' });
    }

    return true;
  }
}
