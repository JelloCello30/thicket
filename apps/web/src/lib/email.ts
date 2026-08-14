import "server-only";
import { serverEnv } from "@tabmind/config/env";

/**
 * Magic-link delivery. With RESEND_API_KEY set, mail goes out via Resend's
 * HTTP API; in dev without it, the link is printed to the server console so
 * login still works end-to-end.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    console.log(`\n━━━ TabMind magic link for ${to} ━━━\n${url}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject: "Sign in to TabMind",
      text: `Click to sign in to TabMind:\n\n${url}\n\nThis link expires in 10 minutes. If you didn't request it, you can ignore this email.`,
      html: [
        `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:32px 16px;color:#1c1b18">`,
        `<p style="font-size:15px;line-height:1.5">Click to sign in to TabMind:</p>`,
        `<p style="margin:24px 0"><a href="${url}" style="background:#2f6b4f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:15px;display:inline-block">Sign in</a></p>`,
        `<p style="font-size:13px;color:#5d5a51;line-height:1.5">This link expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
        `</div>`,
      ].join(""),
    }),
  });
  if (!response.ok) {
    throw new Error(`Magic-link email failed (${response.status}).`);
  }
}
