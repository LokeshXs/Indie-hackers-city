import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [environment, action] = process.argv.slice(2);
const envFile = environment === "local" ? ".env.local" : environment === "remote" ? ".env" : null;

if (!envFile || !action) {
  console.error("Usage: node scripts/supabase-env.mjs <local|remote> <start|stop|status|migrate|plan>");
  process.exit(1);
}

function loadEnv(path) {
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    console.error(`Missing ${path}. Create it from ${path}.example first.`);
    process.exit(1);
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnv(envFile);

const localCommands = {
  start: ["supabase", "start"],
  stop: ["supabase", "stop"],
  status: ["supabase", "status"],
  migrate: ["supabase", "migration", "up", "--local"],
};

const remoteCommands = {
  status: ["supabase", "migration", "list", "--project-ref", process.env.SUPABASE_PROJECT_REF ?? ""],
  pull: ["supabase", "db", "pull", "--project-ref", process.env.SUPABASE_PROJECT_REF ?? ""],
  plan: ["supabase", "db", "push", "--dry-run", "--project-ref", process.env.SUPABASE_PROJECT_REF ?? ""],
  migrate: ["supabase", "db", "push", "--project-ref", process.env.SUPABASE_PROJECT_REF ?? ""],
};

if (environment === "remote") {
  const missing = ["SUPABASE_PROJECT_REF", "SUPABASE_DB_PASSWORD"].filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")} in .env.`);
    process.exit(1);
  }
}

const command = (environment === "local" ? localCommands : remoteCommands)[action];
if (!command) {
  console.error(`Unsupported ${environment} action: ${action}`);
  process.exit(1);
}

console.log(`Supabase target: ${environment} (${envFile})`);
const result = spawnSync("npx", command, { env: process.env, stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
