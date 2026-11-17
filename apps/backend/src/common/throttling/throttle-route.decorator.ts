export function ThrottleRoute(limit: number, ttl: number): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    const handler = descriptor?.value;
    if (!handler) return descriptor;
    Reflect.defineMetadata('THROTTLER:LIMITdefault', limit, handler);
    Reflect.defineMetadata('THROTTLER:TTLdefault', ttl, handler);
    return descriptor;
  };
}
