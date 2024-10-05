export type Context<T = any> = T;

export type AsyncMiddlewareFunction<T = any> = (
  topic: string,
  message: Buffer,
  context: Context<T>,
  next: () => Promise<void>
) => Promise<void>;

export type AsyncHandlerFunction<T = any> = (
  message: Buffer,
  params: { [key: string]: string } | undefined,
  context: Context<T>,
  topic: string
) => Promise<void>;

export type AsyncErrorMiddlewareFunction<T = any> = (
  err: Error,
  topic: string,
  message: Buffer,
  context: Context<T>,
  next: () => Promise<void>
) => Promise<void>;
