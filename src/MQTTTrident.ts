import EventEmitter from "events";
import mqtt, { MqttClient, IClientOptions, IClientPublishOptions, Packet, MqttClientEventCallbacks } from "mqtt";
import { AsyncMiddlewareFunction, AsyncErrorMiddlewareFunction, AsyncHandlerFunction, Context } from "./types";
import MQTTTrie from "./MQTTTrie";
import MQTTRouter from "./MQTTRouter";

export interface MqttTridentEvents {
  connect: (connack: mqtt.IConnackPacket) => void;
  reconnect: () => void;
  close: () => void;
  offline: () => void;
  error: (error: Error) => void;
  end: () => void;
  // message: (topic: string, message: Buffer, packet: Packet) => void;
  packetsend: (packet: Packet) => void;
  packetreceive: (packet: Packet) => void;
}

export interface MqttTridentOptions extends IClientOptions {
  url?: string;
  lwt?: {
    topic: string;
    payload: Buffer;
    qos?: 0 | 1 | 2;
    retain?: boolean;
  };
}

export default class MQTTTrident<T = any> extends EventEmitter {
  private client: MqttClient;
  private middlewares: AsyncMiddlewareFunction<T>[] = [];
  private errorMiddlewares: AsyncErrorMiddlewareFunction<T>[] = [];
  private trie: MQTTTrie = new MQTTTrie();
  private mqttTopics: Map<string, { options?: { qos?: 0 | 1 | 2 } }> = new Map();
  private subscriptionMap: Map<string, Set<AsyncHandlerFunction<T>>> = new Map();
  private pendingSubscriptions: Array<{ topicPattern: string, options?: { qos?: 0 | 1 | 2 } }> = [];

  // Maintain a set of routers with their prefixes
  private routers: Set<{ router: MQTTRouter<T>; prefix: string }> = new Set();

  constructor(brokerUrl: string, options?: MqttTridentOptions) {
    super();

    let clientOptions: IClientOptions = { ...options };

    // Handle LWT options
    if (options && options.lwt) {
      const { lwt } = options;
      clientOptions.will = {
        topic: lwt.topic,
        payload: lwt.payload,
        qos: lwt.qos ?? 0,
        retain: lwt.retain ?? false,
      };

      clientOptions.keepalive = 60;
      clientOptions.reconnectPeriod = 2000;
      clientOptions.reschedulePings = true;

      clientOptions.manualConnect = false;

      delete (clientOptions as MqttTridentOptions).lwt;
    }
    
    this.client = mqtt.connect(brokerUrl, clientOptions);

    /* Make this an optional flag to log raw MQTT packets
    this.client.on('packetsend', (packet) => {
      console.log(`SEND: ${JSON.stringify(packet)}`);
    });

    this.client.on('packetreceive', (packet) => {
      console.log(`RECV: ${JSON.stringify(packet)}`);
    });
    */

    const eventsToForward: (keyof MqttClientEventCallbacks)[] = [
      'connect',
      'reconnect',
      'close',
      'offline',
      'error',
      'end',
      'packetsend',
      'packetreceive'
    ];
    
    for (const event of eventsToForward) {
      this.client.on(event, (...args: any[]) => {
        // Emit the event on the MqttTrident instance
        this.emit(event, ...args);

        // Emit the event on each router
        for (const { router } of this.routers) {
          router.emit(event, ...args);
        }
      });
    };
  }

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

    if (!this.subscriptionMap.has(topicPattern)) {
      this.subscriptionMap.set(topicPattern, new Set());
    }
    this.subscriptionMap.get(topicPattern)!.add(handler);

    // TODO: Still need to cover subscriptions from higher up objects like
    // subscribing to topic/a and topic/+ would still work but would result in
    // 2 messages being received for any topic/a messages
    if (this.client.connected && !this.mqttTopics.has(mqttTopic)) {
      this.client.subscribe(mqttTopic, { qos: options?.qos ?? 0 });
    }
    else {
      this.pendingSubscriptions.push({ topicPattern, options });
    }
  }

  // Unsubscribe from a topic
  unsubscribe(topicPattern: string) {
    const mqttTopic = topicPattern.replace(/:[^\s/]+/g, '+');
    this.client.unsubscribe(mqttTopic);
    // Remove from trie
    if (this.subscriptionMap.has(topicPattern)) {
      const handlers = this.subscriptionMap.get(topicPattern)!;
      for (const handler of handlers) {
        this.trie.remove(topicPattern, handler);
      }
      this.subscriptionMap.delete(topicPattern);
    }

    // Remove from mqttTopics
    this.mqttTopics.delete(mqttTopic);
  }

  // Mount a router with an optional topic prefix
  useRouter(router: MQTTRouter<T>, prefix: string = '') {
    // Add the router to the set
    this.routers.add({ router, prefix });
  
    // Subscribe to topics with prefix
    for (const { topic, options, handlers: handlers } of router.getTopics()) {
      const fullTopic = prefix ? `${prefix}/${topic}` : topic;
      if (this.client.connected) {
        this.client.subscribe(fullTopic, { qos: options?.qos ?? 0 });
      }
      else {
        if (!this.subscriptionMap.has(fullTopic)) {
          this.subscriptionMap.set(fullTopic, new Set());
        }
        for (const handler of handlers) {
          this.subscriptionMap.get(fullTopic)!.add(handler);
        }
        this.pendingSubscriptions.push({ topicPattern: fullTopic, options });
      }
    }
  }

  // Remove a router
  removeRouter(router: MQTTRouter<T>) {
    // Remove the router from the set
    const routersToRemove = [...this.routers].filter((r) => r.router === router);
    for (const routerInfo of routersToRemove) {
      this.routers.delete(routerInfo);
  
      // Unsubscribe from router's topics
      for (const { topic } of router.getTopics()) {
        const fullTopic = routerInfo.prefix ? `${routerInfo.prefix}/${topic}` : topic;
        this.client.unsubscribe(fullTopic);
      }
    }
  }

  // Publish a single message
  publish(
    topic: string,
    message: string | Buffer,
    options?: IClientPublishOptions,
    callback?: (error?: Error) => void
  ) {
    this.client.publish(topic, message, options, callback);
  }

  // Publish an object to topics based on a path
  publishObject(
    path: string,
    obj: Record<string, any>,
    options?: IClientPublishOptions
  ) {
    const stack: Array<{ currentPath: string; value: any }> = [{ currentPath: path, value: obj }];

    while (stack.length > 0) {
      const { currentPath, value } = stack.pop()!;
      if (typeof value === 'object' && value !== null) {
        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            stack.push({ currentPath: `${currentPath}/${key}`, value: value[key] });
          }
        }
      } else {
        const message = typeof value === 'string' ? value : JSON.stringify(value);
        this.publish(currentPath, message, options);
      }
    }
  }

  // Start listening to messages
  start() {
    // Subscribe to topics defined in the main app
    this.client.on('connect', () => {
      for (const { topicPattern, options } of this.pendingSubscriptions) {
        const mqttTopic = topicPattern.replace(/:[^\s/]+/g, '+');
        this.client.subscribe(mqttTopic, { qos: options?.qos ?? 0 });
      }

      this.pendingSubscriptions = [];
    });

    this.client.on('message', async (topic, message) => {
      // For each router
      for (const { router, prefix } of this.routers) {
        // Check if the topic matches the router's prefix
        if (prefix && !topic.startsWith(prefix)) continue;

        // Remove prefix from topic
        let routerTopic = topic;
        if (prefix && topic.startsWith(prefix)) {
          routerTopic = topic.slice(prefix.length);
          if (routerTopic.startsWith('/')) {
            routerTopic = routerTopic.slice(1);
          }
        }

        // Let the router process the message
        await router.processMessage(routerTopic, message, topic);
      }

      // Also, process any handlers in the main trie
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
                await handler(message, params, context, topic);
              } catch (err) {
                await this.handleError(err as Error, topic, message, context);
              }
            }

            // Emit an event on the MqttTrident instance after processing handlers
            this.emit('message', topic, message, params, context);
          }
        };

        await nextMiddleware();
      }
    });
  }

  private async handleError(
    err: Error,
    topic: string,
    message: Buffer,
    context: Context<T>
  ) {
    const applicableErrorMiddlewares = this.errorMiddlewares;

    let index = -1;

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

  // Gracefully end the MQTT client connection
  end(force: boolean = false, callback?: () => void) {
    this.client.end(force, callback);
  }

  on<K extends keyof MqttTridentEvents>(
    event: K,
    listener: MqttTridentEvents[K]
  ): this {
    super.on(event, listener);
    return this;
  }
}