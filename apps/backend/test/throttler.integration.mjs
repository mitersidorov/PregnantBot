import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlingModule } from '../dist/common/throttling/throttling.module.js';
import { ThrottleRoute } from '../dist/common/throttling/throttle-route.decorator.js';

class ThrottleProbeController {
  getStatus() {
    return { ok: true };
  }
}

Controller('throttle-probe')(ThrottleProbeController);
const handlerDescriptor = Object.getOwnPropertyDescriptor(ThrottleProbeController.prototype, 'getStatus');
Get()(ThrottleProbeController.prototype, 'getStatus', handlerDescriptor);
ThrottleRoute(2, 60000)(ThrottleProbeController.prototype, 'getStatus', handlerDescriptor);
class ThrottleProbeModule {}
Module({ imports: [ThrottlingModule], controllers: [ThrottleProbeController] })(ThrottleProbeModule);

const app = await NestFactory.create(ThrottleProbeModule, { logger: false });
await app.listen(0, '127.0.0.1');
const address = app.getHttpServer().address();
assert.ok(address && typeof address !== 'string');
const url = `http://127.0.0.1:${address.port}/throttle-probe`;
try {
  const statuses = [];
  for (let request = 0; request < 3; request++) statuses.push((await fetch(url)).status);
  assert.deepEqual(statuses, [200, 200, 429]);
  console.log('ThrottlerGuard runtime smoke passed: route metadata limit returns 429 after two requests.');
} finally {
  await app.close();
}

