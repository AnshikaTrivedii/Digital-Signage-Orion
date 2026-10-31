import S3rver from 's3rver';

const server = new S3rver({
  port: 59000,
  address: process.env.ORION_S3_BIND_HOST || '127.0.0.1',
  directory: process.env.ORION_S3_DIRECTORY,
  silent: false,
  configureBuckets: [{ name: 'orion-assets' }],
});

await server.run();
console.log('Local S3 emulator ready on port 59000');

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
