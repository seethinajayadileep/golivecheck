import { startDemoShop } from "../examples/demo-site/server.mjs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shop = await startDemoShop(4173);

const child = spawn(
  process.execPath,
  ["--import", "tsx", path.join(root, "src/cli.ts"), "run", "--config", "examples/suites/shop.yaml"],
  { cwd: root, stdio: "inherit", env: process.env },
);

child.on("exit", async (code) => {
  await shop.close();
  process.exit(code ?? 1);
});
