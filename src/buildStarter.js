const { spawn } = require("child_process");
const childPkgProcess = spawn("./app", [], {
  stdio: ["ignore", "inherit", "inherit", "ipc"],
  detached: true,
});
const readline = require("readline");

if (childPkgProcess.killed) {
  return;
}

process.on("SIGTERM", () => {
  childPkgProcess.send("exit");
  childPkgProcess.kill();
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.setPrompt("> ");
rl.prompt();

rl.on("line", (input) => {
  console.log(`input line: ${input}`);
  if (input === "exit") {
    childPkgProcess.send("exit");
    rl.close();
  } else {
    childPkgProcess.send(input);
    rl.prompt();
  }
});

rl.on("close", () => {
  process.exit(0);
});
