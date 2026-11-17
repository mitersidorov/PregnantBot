import { createServer } from 'node:http';

let count = 0;
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    return;
  }
  if (request.method === 'GET' && request.url === '/requests') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ count }));
    return;
  }
  if (request.method === 'POST' && /^\/bot[^/]+\/setWebhook$/.test(request.url || '')) {
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, result: true }));
    return;
  }
  if (request.method === 'POST' && /^\/bot[^/]+\/sendMessage$/.test(request.url || '')) {
    request.resume();
    count += 1;
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({ ok: true, result: { message_id: count } }),
    );
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' }).end('{"ok":false,"description":"Not found"}');
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
