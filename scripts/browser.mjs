import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), ...process.argv.slice(2)], {
  cwd: root, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, ".cache/playwright") },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
