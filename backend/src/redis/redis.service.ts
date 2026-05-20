import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;

    constructor(private readonly config: ConfigService) {}

    onModuleInit() {
        this.client = new Redis({
            host: this.config.get<string>('REDIS_HOST', 'localhost'),
            port: this.config.get<number>('REDIS_PORT', 6379),
            lazyConnect: true,
        });
    }

    async onModuleDestroy() {
        await this.client.quit();
    }

    async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        await this.client.set(key, value, 'EX', ttlSeconds);
    }

    async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) await this.client.del(...keys);
    }
}
