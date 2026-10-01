import { init } from './server.ts';

const host = Deno.env.get('HOST') ?? '127.0.0.1';
const port = Number(Deno.env.get('PORT') ?? '8002');

await init(host, port);
