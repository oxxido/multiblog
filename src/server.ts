import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { startScheduledPublishJob } from "./modules/content/scheduler.js";

const app = await buildApp();

await app.listen({ host: "0.0.0.0", port: env.PORT });

const stopScheduledPublishJob = startScheduledPublishJob();
app.addHook("onClose", (_instance, done) => {
  stopScheduledPublishJob();
  done();
});
