import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { ENV, type ApiEnv } from "../config/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: string;
  createdAt?: Date;
};
export type CustomerLoginCodeMail = MailMessage & { kind: "customer_login_code"; createdAt: Date };

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)$/i;

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.test(hostname);
}

/** Transport only. Never logs subjects, bodies or login codes: kind and a recipient hash prefix at most. */
@Injectable()
export class MailAdapter {
  private readonly logger = new Logger(MailAdapter.name);
  private transport: Transporter | undefined;

  constructor(@Inject(ENV) private readonly env: ApiEnv) {
    const production = env.NODE_ENV === "production";
    const approved = env.MAIL_REAL_DELIVERY_APPROVED === "true";
    if (env.MAIL_ADAPTER === "file" && production) throw new Error("MAIL_ADAPTER=file is not allowed in production");
    if (env.MAIL_ADAPTER === "smtp") {
      if (!env.SMTP_URL) throw new Error("MAIL_ADAPTER=smtp requires SMTP_URL");
      if (!isLoopbackHost(new URL(env.SMTP_URL).hostname) && !approved)
        throw new Error("SMTP to a non-loopback host requires MAIL_REAL_DELIVERY_APPROVED=true");
      if (production && !approved)
        throw new Error("MAIL_ADAPTER=smtp in production requires MAIL_REAL_DELIVERY_APPROVED=true");
    }
  }

  /** False when sends are silently dropped, so callers must not mark a notification as delivered. */
  get enabled(): boolean {
    return this.env.MAIL_ADAPTER !== "disabled";
  }

  async send(message: MailMessage): Promise<void> {
    if (this.env.MAIL_ADAPTER === "disabled") return;
    if (this.env.MAIL_ADAPTER === "file") {
      await mkdir(this.env.MAIL_SINK_DIR, { recursive: true });
      const at = (message.createdAt ?? new Date()).getTime();
      await writeFile(
        join(this.env.MAIL_SINK_DIR, `${at}-${randomBytes(6).toString("hex")}.json`),
        JSON.stringify(message),
      );
    } else {
      this.transport ??= nodemailer.createTransport({
        url: this.env.SMTP_URL as string,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      await this.transport.sendMail({
        from: this.env.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      });
    }
    this.logger.log(`mail sent kind=${message.kind} to=${hashRecipient(message.to)}`);
  }
}

export function hashRecipient(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}
