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
      } else if (exception.code === 'P2003') {
        // A referenced record is missing or still in use. Prisma's raw message
        // ("Foreign key constraint violated: VoucherEntry_mainAccountId_fkey
        // (index)") names internal constraints and means nothing to a user, so
        // it is translated rather than passed through.
        const field = foreignKeyField(exception);
        status = HttpStatus.CONFLICT;
        body = {
          success: false,
          error: {
            code: 'REFERENCE_ERROR',
            message: field
              ? `This record refers to "${field}", which no longer exists. Refresh and try again.`
              : 'This record refers to another record that no longer exists. Refresh and try again.',
            details: field ? [field] : [],
          },
        };
      } else if (exception.code === 'P2014') {
        status = HttpStatus.CONFLICT;
        body = {
          success: false,
          error: {
            code: 'REFERENCE_ERROR',
            message: 'The change would break a required relation between records.',
            details: [],
          },
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

/**
 * Pulls a human field name out of a Prisma P2003 error.
 *
 * The constraint name encodes the relation
 * (`<Table>_<field>_fkey`), which is mapped to the label the UI uses. Anything
 * unrecognised yields null so the caller falls back to a generic message rather
 * than guessing a field that does not exist.
 */
const RELATION_LABELS: Record<string, string> = {
  mainAccount: 'main account',
  subHead: 'sub head',
  headAccount: 'head account',
  voucher: 'voucher',
  voucherEntry: 'voucher entry',
  customer: 'customer',
  supplier: 'supplier',
  user: 'user',
  organization: 'organisation',
};

function foreignKeyField(exception: Prisma.PrismaClientKnownRequestError): string | null {
  const raw =
    (exception.meta as { field_name?: string } | undefined)?.field_name ??
    (typeof exception.meta === 'object' && exception.meta !== null
      ? ((exception.meta as { constraint?: string }).constraint ?? '')
      : '');
  if (!raw) return null;

  const match = /^(.+?)_(.+?)_fkey$/.exec(raw);
  if (match) {
    const relation = RELATION_LABELS[match[1]];
    return relation ?? match[2].replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
  return raw.replace(/Id$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}