import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startScheduledPublishJob } from "./modules/content/scheduler.js";

const app = await buildApp();

const scheduler: { stop?: () => void } = {};
app.addHook("onClose", (_instance, done) => {
  scheduler.stop?.();
  done();
});

await app.listen({ host: "0.0.0.0", port: env.PORT });

scheduler.stop = startScheduledPublishJob();
