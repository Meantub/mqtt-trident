export type Context<T = any> = T;

export type AsyncMiddlewareFunction<T = any> = (
  topic: string,
  message: Buffer,
  context: Context<T>,
  next: () => Promise<void>
) => Promise<void>;

// TODO: Wrap the messages, params, and topic into a Request type
// TODO: Create a Response type that allows you access to publish
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
