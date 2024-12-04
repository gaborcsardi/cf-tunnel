const core = require('@actions/core');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const fs = require("fs");
const path = require("path");
const os = require("os");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function download() {
  NGROK_MAC   = "https://github.com/cloudflare/cloudflared/releases/download/2024.11.1/cloudflared-darwin-amd64.tgz"
  NGROK_Linux = "https://github.com/cloudflare/cloudflared/releases/download/2024.11.1/cloudflared-linux-amd64"
  NGROK_Win   = "https://github.com/cloudflare/cloudflared/releases/download/2024.11.1/cloudflared-windows-amd64.exe"

  let link = NGROK_Win;
  let ext = "";
  if (os.platform() == "darwin") {
    link = NGROK_MAC;
    ext = "tgz";
  } else if (os.platform() == "linux") {
    link = NGROK_Linux;
  }

  let workingDir = __dirname;
  {
    let img = await tc.downloadTool(link);
    
    if (os.platform() == "darwin") {
      await io.mv(img, path.join(workingDir, "./cf." + ext));
      await exec.exec("tar -xzf " + path.join(workingDir, "./cf." + ext));
      await io.mv("cloudflared", path.join(workingDir, "cloudflared"));
    } else if (os.platform() == "linux") {
      await io.cp(img, path.join(workingDir, "./cloudflared"));
      await exec.exec("sh", [], { input: "chmod +x " +  path.join(workingDir, "./cloudflared")});
    } else {
      await io.mv(img, path.join(workingDir, "./cloudflared.exe"));
    }
  }
}

async function run(protocol, port) {
  let workingDir = __dirname;

  let cfd = path.join(workingDir, "./cloudflared");
  let log = path.join(workingDir, "./cf.log");
  if (os.platform() == "win32") {
    cfd += ".exe";
    cfd = cfd.replace(/^(\w):|\\+/g,'/$1');
    log = log.replace(/^(\w):|\\+/g,'/$1');
  }

  await exec.exec("sh", [], { input: `if ! ${cfd} update; then true; fi` });
  await exec.exec("sh", [], { input: `${cfd} tunnel --url ${protocol}://localhost:${port} >${log} 2>&1 &` });

  for (let i = 0; i < 50; i++) {
    await sleep(1000);
    let output = "";
    await exec.exec("sh", [], {
      input: `cat "${log}" | grep https:// | grep trycloudflare.com | head -1 | cut -d '|' -f 2 | tr -d ' ' | cut -d '/' -f 3`,
      listeners: {
        stdout: (s) => {
          output += s;
        }
      }
    });
    let server = output;//lines[lines.length - 1];
    if (!server) {
      continue;
    }
    await exec.exec("sh", [], { input: `echo "server=${server}" >> $GITHUB_OUTPUT` });

    break;
  }
}

async function main() {

  let protocol = core.getInput("protocol");
  if (!protocol) {
    protocol = "tcp";
  }

  let port = core.getInput("port");
  if (!port) {
    core.setFailed("No port !");
    return;
  }

  await download();
  await run(protocol, port);

  process.exit();
}

main().catch(ex => {
  core.setFailed(ex.message);
});

