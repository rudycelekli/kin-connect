export {};
// Vite proxies a browser origin on port 5173 to the loopback API on 4318.
process.env.KIN_DEV_ORIGIN = 'http://127.0.0.1:5173';
await import('./index.js');
