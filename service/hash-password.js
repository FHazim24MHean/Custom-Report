const crypto = require("crypto");

let password = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  password += chunk;
  if (password.length > 4096) {
    process.stderr.write("Password input is too long.\n");
    process.exit(1);
  }
});
process.stdin.on("end", () => {
  password = password.replace(/\r?\n$/, "");
  if (password.length < 12) {
    process.stderr.write("Password must contain at least 12 characters.\n");
    process.exitCode = 1;
    return;
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  process.stdout.write(`scrypt:${salt.toString("hex")}:${hash.toString("hex")}\n`);
});
