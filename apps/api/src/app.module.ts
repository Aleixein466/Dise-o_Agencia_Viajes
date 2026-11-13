import { Module, type DynamicModule } from "@nestjs/common";
import { ENV, type ApiEnv } from "./config/env";
import { DbService } from "./db/db.service";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";

@Module({})
export class AppModule {
  static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController],
      providers: [{ provide: ENV, useValue: env }, DbService, AuthService],
    };
  }
}
