import { Response } from 'express';

interface SuccessResponse {
  statusCode?: number;
  message?: string;
  data?: any;
}

export const sendSuccess = (res: Response, { statusCode = 200, message = 'Success', data }: SuccessResponse) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (res: Response, statusCode: number, message: string, details?: any) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    details,
  });
};
