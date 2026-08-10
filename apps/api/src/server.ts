import { startApi } from "./startup.js";

try {
  await startApi();
} catch (error: unknown) {
  process.exitCode = 1;
}
