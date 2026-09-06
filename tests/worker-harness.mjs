// Adapts the unchanged browser worker protocol to a real Node worker thread.
// This validates task messaging, not browser worker permissions or URL loading.
import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
await import('../src/worker.js');
parentPort.on('message',data=>self.onmessage({data}));
parentPort.postMessage({ready:true});
