import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiException } from '../exceptions/api.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [],
      },
    };

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      body = exception.getResponse() as Record<string, unknown>;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        body = {
          success: false,
          error: {
            code: status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'BAD_REQUEST',
            message: res,
            details: [],
          },
        };
      } else {
        const r = res as Record<string, unknown>;
        body = {
          success: false,
          error: {
            code:
              status === HttpStatus.NOT_FOUND
                ? 'NOT_FOUND'
                : status === HttpStatus.UNAUTHORIZED
                  ? 'UNAUTHORIZED'
                  : status === HttpStatus.FORBIDDEN
                    ? 'FORBIDDEN'
                    : 'BAD_REQUEST',
            message: Array.isArray(r.message)
              ? (r.message as string[]).join(', ')
              : ((r.message as string) ?? 'Bad request'),
            details: Array.isArray(r.message) ? (r.message as string[]) : [],
          },
        };
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.CONFLICT;
      if (exception.code === 'P2002') {
        body = {
          success: false,
          error: {
            code: 'DUPLICATE_CODE',
            message: `A record with the same value already exists: ${exception.meta?.target}`,
            details: [exception.meta?.target],
          },
        };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Record not found', details: [] },
        };
      } else {
        body = {
          success: false,
          error: { code: 'DATABASE_ERROR', message: exception.message, details: [] },
        };
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      body = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid database payload', details: [] },
      };
    } else if (exception instanceof Error) {
      body = {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: exception.message,
          details: [],
        },
      };
      this.logger.error(`${request.method} ${request.url} -> ${exception.message}`, exception.stack);
    }

    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      this.logger.debug((exception as Error).stack);
    }

    response.status(status).json(body);
  }
}