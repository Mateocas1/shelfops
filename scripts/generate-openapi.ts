import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { openApiDocument } from "../apps/api/src/openapi.js";

async function generate(): Promise<void> {
  const outputPath = resolve(process.cwd(), "openapi", "openapi.json");
  const document = await openApiDocument();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
