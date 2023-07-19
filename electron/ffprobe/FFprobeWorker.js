var __classPrivateFieldSet =
  (this && this.__classPrivateFieldSet) ||
  function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver))
      throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (
      kind === "a"
        ? f.call(receiver, value)
        : f
        ? (f.value = value)
        : state.set(receiver, value),
      value
    );
  };
var __classPrivateFieldGet =
  (this && this.__classPrivateFieldGet) ||
  function (receiver, state, kind, f) {
    if (kind === "a" && !f)
      throw new TypeError("Private accessor was defined without a getter");
    if (
      typeof state === "function"
        ? receiver !== state || !f
        : !state.has(receiver)
    )
      throw new TypeError(
        "Cannot read private member from an object whose class did not declare it"
      );
    return kind === "m"
      ? f
      : kind === "a"
      ? f.call(receiver)
      : f
      ? f.value
      : state.get(receiver);
  };
var _FFprobeWorker_instances,
  _FFprobeWorker_worker,
  _FFprobeWorker_validateFile,
  _FFprobeWorker_postMessage;
import { stat } from "fs/promises";
import { basename, dirname } from "path";
import { fileURLToPath } from "url";
import { MessageChannel, Worker } from "worker_threads";
export class FFprobeWorker {
  _worker

  constructor() {
    _FFprobeWorker_instances.add(this);
    _FFprobeWorker_worker.set(this, void 0);
    const __dirname = dirname(fileURLToPath(import.meta.url));
    this._worker = new Worker(`${__dirname}/ffprobe-worker-node.js`)
      __classPrivateFieldSet(
        this,
        _FFprobeWorker_worker,
        this._worker,
        "f"
      );
  }

  async getFileInfo(filePath) {
    __classPrivateFieldGet(
      this,
      _FFprobeWorker_instances,
      "m",
      _FFprobeWorker_validateFile
    ).call(this, filePath);
    const fileInfo = await __classPrivateFieldGet(
      this,
      _FFprobeWorker_instances,
      "m",
      _FFprobeWorker_postMessage
    ).call(this, {
      type: "getFileInfo",
      payload: [basename(filePath), { root: dirname(filePath) }],
    });
    fileInfo.format.filename = filePath;
    fileInfo.format.size = (await stat(filePath)).size.toString();
    return fileInfo;
  }
  async getFrames(filePath, offset) {
    __classPrivateFieldGet(
      this,
      _FFprobeWorker_instances,
      "m",
      _FFprobeWorker_validateFile
    ).call(this, filePath);
    return __classPrivateFieldGet(
      this,
      _FFprobeWorker_instances,
      "m",
      _FFprobeWorker_postMessage
    ).call(this, {
      type: "getFrames",
      payload: [basename(filePath), { root: dirname(filePath) }, offset],
    });
  }
  terminate() {
    __classPrivateFieldGet(this, _FFprobeWorker_worker, "f").terminate();
  }
}

(_FFprobeWorker_worker = new WeakMap()),
  (_FFprobeWorker_instances = new WeakSet()),
  (_FFprobeWorker_validateFile = function _FFprobeWorker_validateFile(
    filePath
  ) {
    if (typeof filePath === "object") {
      throw new Error(
        "File object only supported in Browser, you must provide a string (path)"
      );
    }
  }),
  (_FFprobeWorker_postMessage = function _FFprobeWorker_postMessage(data) {
    const channel = new MessageChannel();
    const message = {
      ...data,
      port: channel.port2,
    };
    __classPrivateFieldGet(this, _FFprobeWorker_worker, "f").postMessage(
      message,
      [channel.port2]
    );
    return new Promise((resolve, reject) => {
      channel.port1.on("message", (data) => {
        if (data.status === "success") {
          resolve(data.payload);
        } else {
          reject(new Error(data.message));
        }
      });
    });
  });
