import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import SnowflakeId from 'snowflake-id';

@Injectable()
export class IdService implements OnModuleInit {
  private snowflake: any;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const workerId = this.configService.get<number>('SNOWFLAKE_WORKER_ID', 1);

    this.snowflake = new SnowflakeId({
      mid: workerId
    });
  }

  /**
   * Generates a unique Snowflake ID using the snowflake-id library.
   * @returns A 64-bit ID string 
   */
  generate(): string {
    return this.snowflake.generate();
  }
}

