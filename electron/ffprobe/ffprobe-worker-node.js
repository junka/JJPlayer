import { createRequire } from "module";
import { parentPort } from "worker_threads";
import { createListener } from "./ffprobe-worker.js";
if (!parentPort) {
  throw new Error(
    "parentPort must be defined. Are you sure you are in a worker context?"
  );
}
const require = createRequire(import.meta.url);
const promise = new Promise((resolve) => {
    const ffprobe = require("./ffprobe-wasm.js");
    ffprobe.onRuntimeInitialized = () => {
      resolve(ffprobe);
    };
  });
// promise.then(()=>{
//   console.log("promise then")
// })
const listener = createListener(promise, "NODEFS");
parentPort.on("message", listener);
