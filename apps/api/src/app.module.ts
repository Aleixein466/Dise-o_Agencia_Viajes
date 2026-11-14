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
import { AdminQuotesController } from "./quotes/admin-quotes.controller";
import { AdminQuotesService } from "./quotes/admin-quotes.service";
import { PublicModule } from "./public/public.module";
import { CrmController } from "./crm/crm.controller";
import { CrmService } from "./crm/crm.service";
import { MailAdapter } from "./notifications/mail";
import { PublicRateLimiter } from "./public/public-rate-limiter";
import { PortalController } from "./portal/portal.controller";
import { ReservationsController } from "./reservations/reservations.controller";
import { ReservationsService } from "./reservations/reservations.service";
import { CustomerAuthController } from "./customer-auth/customer-auth.controller";
import { PaymentsController } from "./payments/payments.controller";
import { PaymentsService } from "./payments/payments.service";
import { SandboxTestGateway } from "./payments/sandbox-gateway";
import { createPaymentGateway, PAYMENT_GATEWAY } from "./payments/gateway";
import { FinanceController } from "./finance/finance.controller";
import { FinanceService } from "./finance/finance.service";
import { NotificationsService } from "./notifications/notifications.service";
import { CustomerPqrsController, PublicPqrsController, StaffPqrsController } from "./pqrs/pqrs.controller";
import { PqrsService } from "./pqrs/pqrs.service";

@Module({})
export class AppModule {
  static register(env: ApiEnv): DynamicModule {
    const paymentGateway = createPaymentGateway(env);
    return {
      module: AppModule,
      imports: [PublicModule.register(env)],
      controllers: [
        HealthController,
        AuthController,
        UsersController,
        DestinationsController,
        CatalogAdminController,
        GalleryController,
        AdminQuotesController,
        CrmController,
        PortalController,
        ReservationsController,
        PaymentsController,
        FinanceController,
        CustomerAuthController,
        PublicPqrsController,
        CustomerPqrsController,
        StaffPqrsController,
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
        AdminQuotesService,
        CrmService,
        MailAdapter,
        PublicRateLimiter,
        ReservationsService,
        PaymentsService,
        { provide: PAYMENT_GATEWAY, useValue: paymentGateway },
        // Interim alias: ReservationsService still injects this token and only calls enabled()/checkoutUrl(), which
        // every PaymentGateway provides. Remove once it injects PAYMENT_GATEWAY.
        { provide: SandboxTestGateway, useValue: paymentGateway },
        FinanceService,
        NotificationsService,
        PqrsService,
      ],
    };
  }
}
