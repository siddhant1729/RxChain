/** Error carrying an HTTP status, rendered by the central error handler. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (msg: string) => new HttpError(404, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
