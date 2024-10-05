import EventEmitter from "events";
import MQTTTrie from "./MQTTTrie";
import { AsyncMiddlewareFunction, AsyncErrorMiddlewareFunction, AsyncHandlerFunction, Context } from "./types";
import mqtt, { Packet } from "mqtt";

export interface MqttRouterEvents {
  connect: (connack: mqtt.IConnackPacket) => void;
  reconnect: () => void;
  close: () => void;
  offline: () => void;
  error: (error: Error) => void;
  end: () => void;
  message: (topic: string, message: Buffer, packet: Packet) => void;
  packetsend: (packet: Packet) => void;
  packetreceive: (packet: Packet) => void;
}

export default class MQTTRouter<T = any> extends EventEmitter {
  private middlewares: AsyncMiddlewareFunction<T>[] = [];
  private errorMiddlewares: AsyncErrorMiddlewareFunction<T>[] = [];
  private trie: MQTTTrie = new MQTTTrie();
  private mqttTopics: Map<string, { options?: { qos?: 0 | 1 | 2 } }> = new Map();
  private subscriptionMap: Map<string, Set<AsyncHandlerFunction<T>>> = new Map();

  // Middleware registration
  use(middleware: AsyncMiddlewareFunction<T>) {
    this.middlewares.push(middleware);
  }

  // Error middleware registration
  useError(middleware: AsyncErrorMiddlewareFunction<T>) {
    this.errorMiddlewares.push(middleware);
  }

  // Subscribe and register handlers
  subscribe(
    topicPattern: string,
    handler: AsyncHandlerFunction<T>,
    options?: { qos?: 0 | 1 | 2 }
  ) {
    this.trie.insert(topicPattern, handler);
    const mqttTopic = topicPattern.replace(/:[^\s/]+/g, '+');
    this.mqttTopics.set(mqttTopic, { options });

    // Maintain a map of topic patterns to handlers
    if (!this.subscriptionMap.has(topicPattern)) {
      this.subscriptionMap.set(topicPattern, new Set());
    }
    this.subscriptionMap.get(topicPattern)!.add(handler);
  }

  unsubscribe(topicPattern: string, handler: AsyncHandlerFunction<T>) {
    this.trie.remove(topicPattern, handler);
    const mqttTopic = topicPattern.replace(/:[^\s/]+/g, '+');

    // Remove handler from subscription map
    if (this.subscriptionMap.has(topicPattern)) {
      const handlers = this.subscriptionMap.get(topicPattern)!;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptionMap.delete(topicPattern);
        // Remove topic from mqttTopics
        this.mqttTopics.delete(mqttTopic);
      }
    }
  }

  // Get MQTT topics for subscription with prefix
  getTopics(prefix: string = ''): { topic: string; handlers: Set<AsyncHandlerFunction<T>>; options?: { qos?: 0 | 1 | 2 } }[] {
    return Array.from(this.mqttTopics.entries()).map(([topic, { options }]) => {
      const handlers = this.subscriptionMap.get(topic);
      return {
        topic: prefix ? `${prefix}/${topic}` : topic,
        options,
        handlers: handlers ?? new Set()
      }
    });
  }

  // Get the trie for matching
  getTrie(): MQTTTrie {
    return this.trie;
  }

  // Get middlewares
  getMiddlewares(): AsyncMiddlewareFunction<T>[] {
    return this.middlewares;
  }

  // Get error middlewares
  getErrorMiddlewares(): AsyncErrorMiddlewareFunction<T>[] {
    return this.errorMiddlewares;
  }

  getMqttTopics(): Map<string, { options?: { qos?: 0 | 1 | 2 } }> {
    return this.mqttTopics;
  }

  async processMessage(topic: string, message: Buffer, fullTopic?: string) {
    const matchResult = this.trie.match(topic);

    if (matchResult) {
      const { handlers, params } = matchResult;

      // Collect applicable middlewares
      const applicableMiddlewares = this.middlewares;

      let index = -1;
      const context: Context<T> = {} as Context<T>;

      const nextMiddleware = async (): Promise<void> => {
        index++;
        if (index < applicableMiddlewares.length) {
          try {
            await applicableMiddlewares[index](topic, message, context, nextMiddleware);
          } catch (err) {
            await this.handleError(err as Error, topic, message, context);
          }
        } else {
          for (const handler of handlers) {
            try {
              await handler(message, params, context, fullTopic || topic);
            } catch (err) {
              await this.handleError(err as Error, topic, message, context);
            }
          }

          // Emit an event on the router after processing handlers
          this.emit('message', topic, message, params, context);
        }
      };

      await nextMiddleware();
    }
  }

  private async handleError(
    err: Error,
    topic: string,
    message: Buffer,
    context: Context<T>
  ) {
    let index = -1;
    const applicableErrorMiddlewares = this.errorMiddlewares;

    const nextErrorMiddleware = async (): Promise<void> => {
      index++;
      if (index < applicableErrorMiddlewares.length) {
        await applicableErrorMiddlewares[index](
          err,
          topic,
          message,
          context,
          nextErrorMiddleware
        );
      } else {
        console.error(`Unhandled error on topic ${topic}: ${err.message}`);
      }
    };

    await nextErrorMiddleware();
  }

  on<K extends keyof MqttRouterEvents>(
    event: K,
    listener: MqttRouterEvents[K]
  ): this {
    super.on(event, listener);
    return this;
  }
}

