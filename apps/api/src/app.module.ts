import { Module, type DynamicModule } from "@nestjs/common";
import { ENV, type ApiEnv } from "./config/env";
import { DbService } from "./db/db.service";
import { HealthController } from "./health/health.controller";

@Module({})
export class AppModule {
  static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }, DbService],
    };
  }
}
