import { BadRequestException, Controller, Get, Inject, Param } from "@nestjs/common";
import { z } from "zod";
import { PublicCatalogService } from "./public-catalog.service";

@Controller("public")
export class PublicCatalogController {
  constructor(@Inject(PublicCatalogService) private readonly catalog: PublicCatalogService) {}
  @Get("destinations") destinations() {
    return this.catalog.destinations();
  }
  @Get("packages/:id/builder") builder(@Param("id") id: string) {
    if (!z.uuid().safeParse(id).success) throw new BadRequestException();
    return this.catalog.builder(id);
  }
}
