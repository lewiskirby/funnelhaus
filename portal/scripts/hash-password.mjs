// Prints an ADMIN_PASSWORD_HASH line for .env.local / Vercel.
// The password is typed without being shown and is never saved anywhere.
// Usage: npm run hash-password

import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";

function ask(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    stdin.on("data", (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(1); // Ctrl+C
        if (ch === "\u007f") value = value.slice(0, -1); // Backspace
        else value += ch;
      }
    });
  });
}

const password = await ask("New admin password: ");
if (password.length < 12) {
  console.error("Please use at least 12 characters.");
  process.exit(1);
}
const confirm = await ask("Type it again: ");
if (confirm !== password) {
  console.error("Passwords didn't match. Nothing was generated.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log("\nAdd this line to portal/.env.local (and to Vercel later):\n");
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`);
