import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ENV, type ApiEnv } from "../config/env";

export type CustomerLoginCodeMail = {
  to: string;
  subject: string;
  text: string;
  kind: "customer_login_code";
  createdAt: Date;
};
@Injectable()
export class MailAdapter {
  constructor(@Inject(ENV) private readonly env: ApiEnv) {
    if (env.NODE_ENV === "production" && env.MAIL_ADAPTER === "file")
      throw new Error("MAIL_ADAPTER=file is not allowed in production");
  }
  async send(message: CustomerLoginCodeMail): Promise<void> {
    if (this.env.MAIL_ADAPTER === "disabled") return;
    await mkdir(this.env.MAIL_SINK_DIR, { recursive: true });
    await writeFile(
      join(this.env.MAIL_SINK_DIR, `${message.createdAt.getTime()}-${randomBytes(6).toString("hex")}.json`),
      JSON.stringify(message),
    );
  }
}
