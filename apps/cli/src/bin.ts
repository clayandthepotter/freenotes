#!/usr/bin/env node
import { runCli } from "./cli.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

runCli(process.argv.slice(2), {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  readStdin,
  env: process.env,
  cwd: process.cwd(),
}).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
