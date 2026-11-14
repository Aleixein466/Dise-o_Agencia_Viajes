import { Module, type DynamicModule } from "@nestjs/common";
import { ENV, type ApiEnv } from "./config/env";
import { DbService } from "./db/db.service";
import { HealthController } from "./health/health.controller";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";
import { DestinationsController } from "./catalog/destinations.controller";
import { DestinationsService } from "./catalog/destinations.service";
import { PortfolioImportService } from "./catalog/portfolio-import.service";
import { CatalogAdminController } from "./catalog/catalog-admin.controller";
import { CatalogAdminService } from "./catalog/catalog-admin.service";
import { GalleryController } from "./catalog/gallery.controller";
import { GalleryService } from "./catalog/gallery.service";

@Module({})
export class AppModule {
  static register(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        DestinationsController,
        CatalogAdminController,
        GalleryController,
      ],
      providers: [
        { provide: ENV, useValue: env },
        DbService,
        AuthService,
        UsersService,
        DestinationsService,
        PortfolioImportService,
        CatalogAdminService,
        GalleryService,
      ],
    };
  }
}
