import MQTTRouter from "./MQTTRouter";
import MQTTTrident from "./MQTTTrident";


const mqttTrident = new MQTTTrident("mqtt://127.0.0.1:1883");

/* mqttTrident.subscribe("weather/day/:dayId", async (message, params) => {
  console.log(message.toString(), params);
});
 */
mqttTrident.subscribe("weather/day/1", async (message) => {
  console.warn(message.toString());
});

const weatherRouter = new MQTTRouter();

weatherRouter.subscribe("day/1", async (message, params) => {
  console.log(message.toString());
});

mqttTrident.useRouter(weatherRouter, "weather");

mqttTrident.start();