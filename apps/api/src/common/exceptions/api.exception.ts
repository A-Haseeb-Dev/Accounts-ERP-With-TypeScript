import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'UNBALANCED_VOUCHER'
  | 'DUPLICATE_CODE'
  | 'INVALID_TRANSACTION'
  | 'BAD_REQUEST'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

export class ApiException extends HttpException {
  constructor(
    message: string,
    code: ErrorCode = 'BAD_REQUEST',
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details: unknown[] = [],
  ) {
    super(
      {
        success: false,
        error: { code, message, details },
      },
      status,
    );
  }

  static validation(message: string, details: unknown[] = []): ApiException {
    return new ApiException(message, 'VALIDATION_ERROR', HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(message = 'Unauthorized'): ApiException {
    return new ApiException(message, 'UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiException {
    return new ApiException(message, 'FORBIDDEN', HttpStatus.FORBIDDEN);
  }

  static notFound(entity = 'Resource'): ApiException {
    return new ApiException(`${entity} not found`, 'NOT_FOUND', HttpStatus.NOT_FOUND);
  }

  static conflict(message: string): ApiException {
    return new ApiException(message, 'CONFLICT', HttpStatus.CONFLICT);
  }

  static duplicateCode(field = 'Code'): ApiException {
    return new ApiException(`${field} already exists`, 'DUPLICATE_CODE', HttpStatus.CONFLICT);
  }

  static insufficientStock(itemName: string, available: number, requested: number): ApiException {
    return new ApiException(
      `Insufficient stock for ${itemName}. Available: ${available}, requested: ${requested}.`,
      'INSUFFICIENT_STOCK',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  static unbalancedVoucher(debit: number, credit: number): ApiException {
    return new ApiException(
      `Unbalanced voucher. Total debit ${debit} does not equal total credit ${credit}.`,
      'UNBALANCED_VOUCHER',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  static invalidTransaction(message: string): ApiException {
    return new ApiException(message, 'INVALID_TRANSACTION', HttpStatus.UNPROCESSABLE_ENTITY);
  }

  static rateLimited(message = 'Too many requests, please try again later'): ApiException {
    return new ApiException(message, 'RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS);
  }
}