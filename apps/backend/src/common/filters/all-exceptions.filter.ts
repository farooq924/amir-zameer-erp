import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId: string;
}

/** Centralised error handling: consistent JSON errors, no stack traces or SQL leaked to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = randomUUID();
    const body = this.toBody(exception, requestId);

    if (body.statusCode >= 500) {
      // Log method + path only (no body / query values: they may contain business data).
      this.logger.error(`[${requestId}] ${req.method} ${req.path} -> ${body.statusCode}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack);
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, requestId: string): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message = exception.message;
      let details: unknown;
      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: unknown; details?: unknown };
        if (Array.isArray(r.message)) {
          message = 'Validation failed';
          details = r.message;
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
        if (r.details) details = r.details;
      }
      return { statusCode: status, error: HttpStatus[status] ?? 'Error', message, details, requestId };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { statusCode: 409, error: 'CONFLICT', message: 'A record with the same unique value already exists',
            details: { fields: (exception.meta?.target as string[] | undefined) ?? [] }, requestId };
        case 'P2025':
          return { statusCode: 404, error: 'NOT_FOUND', message: 'Record not found', requestId };
        case 'P2003':
          return { statusCode: 409, error: 'CONFLICT', message: 'This record is linked to other records', requestId };
        case 'P2010': {
          const msg = String(exception.meta?.message ?? '');
          if (msg.includes('P0001')) return this.businessRule(msg, requestId);
          break;
        }
      }
    }

    // Business-rule violations raised by database triggers (SQLSTATE P0001).
    const message = (exception as Error)?.message ?? '';
    if (message.includes('P0001') || /append-only|immutable|not balanced|period .* closed/i.test(message)) {
      return this.businessRule(message, requestId);
    }

    return { statusCode: 500, error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred', requestId };
  }

  private businessRule(raw: string, requestId: string): ErrorBody {
    const match = raw.match(/(Records in .*?|Journal entr.*?|Posted .*?|Lines of .*?|Measurement .*?|Payments .*?|Accounting period .*?)(?:"|$|\n)/);
    return { statusCode: 422, error: 'UNPROCESSABLE_ENTITY', message: match?.[1]?.trim() ?? 'Business rule violation', requestId };
  }
}
