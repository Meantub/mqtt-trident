# MQTT Trident

**MQTT Trident** is a lightweight framework that provides an Express-like interface for managing MQTT subscriptions. It simplifies the process of setting up, organizing, and managing MQTT topics using a routing approach familiar to Node.js developers.

## Features

- Express-like interface for defining MQTT routes.
- Simple, intuitive API to manage MQTT topics.
- Support for parameterized subscriptions.
- Modular routing with `MQTTRouter`.
- Support for middleware.

## Installation

To install MQTT Trident, you can use npm or yarn

## Example Usage

Here's an example of how to use MQTT Trident to create an MQTT server with simple subscriptions:

## Key Concepts

### MQTTTrident

`MQTTTrident` is the core class that manages the MQTT connection, subscriptions, middleware, and message handling. You provide an MQTT broker URL, and then use `subscribe()` to add topic listeners, `use()` to register middleware, or `useRouter()` to mount routers for specific topic namespaces.

### MQTTRouter

`MQTTRouter` provides modular routing for MQTT topics, allowing you to group related subscriptions together and manage them more effectively. It's similar to Express routers, making it easy to separate concerns in your MQTT handling logic.

## API Reference

### `new MQTTTrident(brokerUrl: string, options?: MqttTridentOptions)`

Creates a new instance of MQTT Trident and connects to the specified broker.

- **brokerUrl**: The URL of the MQTT broker (e.g., `mqtt://127.0.0.1:1883`).
- **options**: Optional settings for the MQTT client, including Last Will and Testament (LWT).

### `mqttTrident.subscribe(topic: string, handler: AsyncHandlerFunction<T>, options?: { qos?: 0 | 1 | 2 })`

Subscribes to a specific MQTT topic.

- **topic**: The topic to subscribe to. You can use parameterized topics with `:` to extract parameters (e.g., `weather/day/:dayId`).
- **handler**: A function to handle incoming messages, receiving `message`, `params`, `context`, and `topic`.
- **options**: Optional Quality of Service (QoS) settings.

### `mqttTrident.unsubscribe(topic: string)`

Unsubscribes from a specific MQTT topic.

- **topic**: The topic to unsubscribe from.

### `mqttTrident.use(middleware: AsyncMiddlewareFunction<T>)`

Registers a middleware function that will be called for every incoming message.

- **middleware**: A function that processes messages, receiving `topic`, `message`, `context`, and `next`.

### `mqttTrident.useError(middleware: AsyncErrorMiddlewareFunction<T>)`

Registers an error middleware function to handle errors during message processing.

- **middleware**: A function that handles errors, receiving `err`, `topic`, `message`, `context`, and `next`.

### `mqttTrident.useRouter(router: MQTTRouter, namespace: string)`

Mounts a router on a specific topic namespace.

- **router**: An instance of `MQTTRouter`.
- **namespace**: The base topic namespace under which all routes defined in the router will be available.

### `new MQTTRouter()`

Creates a new router instance that can handle related topics.

### `router.subscribe(topic: string, handler: AsyncHandlerFunction<T>)`

Subscribes to a topic within the router's namespace.

- **topic**: The topic to subscribe to.
- **handler**: A function to handle incoming messages, receiving `message`, `params`, `context`, and `topic`.

### `mqttTrident.publish(topic: string, message: string | Buffer, options?: IClientPublishOptions, callback?: (error?: Error) => void)`

Publishes a message to a specific topic.

- **topic**: The topic to publish the message to.
- **message**: The message to be published.
- **options**: Optional publish options.
- **callback**: Optional callback function to be called after publishing.

### `mqttTrident.publishObject(path: string, obj: Record<string, any>, options?: IClientPublishOptions)`

Publishes an object to topics based on a specified path.

- **path**: The base path for the object to be published.
- **obj**: The object to traverse and publish.
- **options**: Optional publish options.

### Middleware

Middleware functions allow you to add reusable logic that processes messages before they reach the final handler. Middleware is defined using `use()` and can be used for tasks like logging, authentication, message transformation, rate limiting, or filtering messages based on certain criteria.

Example use cases:

- **Logging**: Record all incoming messages for auditing purposes.
- **Authentication**: Ensure that messages come from authorized sources before passing them to the handler.
- **Rate Limiting**: Limit the number of messages processed within a certain time frame to avoid overloading the system.
- **Message Filtering**: Drop messages that do not meet certain criteria, such as invalid payloads or unauthorized topics. Middleware is defined using `use()` and can be used for tasks like logging, authentication, or message transformation.

## License

MQTT Trident is MIT licensed. See the [LICENSE](./LICENSE) file for more details.

## Contributing

Contributions are welcome! Please feel free to submit issues, fork the repository, and open pull requests.
