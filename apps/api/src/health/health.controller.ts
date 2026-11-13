import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { healthResponse, type HealthResponse } from "@ricaurte/validation";
import { DbService } from "../db/db.service";

@Controller("health")
export class HealthController {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  /** Liveness: no dependencies are touched. */
  @Get()
  health(): HealthResponse {
    return healthResponse.parse({ status: "ok" });
  }

  /** Readiness: 503 (problem+json, no cause) when the database is missing or unreachable. */
  @Get("ready")
  async ready(): Promise<HealthResponse> {
    if (!(await this.db.isReady())) throw new ServiceUnavailableException();
    return healthResponse.parse({ status: "ok" });
  }
}
