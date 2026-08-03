import express from "express";
import * as path from "path";
import { skySnapshotRouter } from "./routes/skySnapshot";

export function createApp() {
  const app = express();
  app.use(skySnapshotRouter);
  app.use(express.static(path.join(__dirname, "..", "public")));
  return app;
}

if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`Sky Snapshot server listening on http://localhost:${port}`);
  });
}
