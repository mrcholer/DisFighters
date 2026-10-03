import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/ludicord/bin/ludicord.js", "dev", ...process.argv.slice(2)], {
  stdio: "inherit", env: { ...process.env, NODE_ENV: "development", DISFIGHTERS_BROWSER_TEST: "true" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code ?? 1; });
