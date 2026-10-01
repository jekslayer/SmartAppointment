import { NextFunction, Request, Response } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
  constraint?: string;
}

export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  const databaseCode = (err as AppError & { code?: string }).code;
  const isActivePatientAppointmentConflict = databaseCode === '23505'
    && ((err as AppError).constraint === 'appointments_one_active_per_patient_uidx'
      || err.message.includes('appointments_one_active_per_patient_uidx'));
  const statusCode = err.statusCode || (databaseCode === '23505' ? 409 : 500);
  const requestedMessage = isActivePatientAppointmentConflict
    ? 'Patient already has an active appointment'
    : databaseCode === '23505' ? 'Duplicate data or an appointment slot is already reserved' : err.message || 'Internal Server Error';
  // Unexpected server errors must not reveal database, provider, or secret details to the browser.
  const message = statusCode >= 500 ? 'Internal Server Error' : requestedMessage;
  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      details: statusCode >= 500 ? null : err.details || null,
      timestamp: new Date().toISOString()
    }
  });
};

export const createError = (statusCode: number, message: string, details?: unknown): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
};
