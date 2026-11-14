import { Module, type DynamicModule } from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";
import { DbService } from "../db/db.service";
import { PublicCatalogController } from "./public-catalog.controller";
import { PublicCatalogService } from "./public-catalog.service";
import { PublicQuotesController } from "./public-quotes.controller";
import { PublicQuotesService } from "./public-quotes.service";
import { PublicRateLimiter } from "./public-rate-limiter";

@Module({})
export class PublicModule {
  static register(env: ApiEnv): DynamicModule { return { module: PublicModule, controllers: [PublicCatalogController, PublicQuotesController], providers: [{ provide: ENV, useValue: env }, DbService, PublicCatalogService, PublicQuotesService, PublicRateLimiter] }; }
}
