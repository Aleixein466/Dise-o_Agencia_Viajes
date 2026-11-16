import { HttpException, Injectable } from "@nestjs/common";

@Injectable()
export class PublicRateLimiter {
  private readonly buckets = new Map<string, { count: number; reset: number }>();
  check(ip: string, scope: string, max = 10, windowMs = 60_000) {
    const key = `${scope}:${ip}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket = !current || current.reset <= now ? { count: 0, reset: now + windowMs } : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > max) throw new HttpException("Too many requests", 429);
  }
}
