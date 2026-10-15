import QRCode from "qrcode";

export type CredentialEmail = {
  to: string;
  studentName: string;
  enrollment: string;
  program: string;
  eventName: string;
  credential: string;
};

export type EmailResult = { provider: "resend"; messageId: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

export function resendConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  return { configured: Boolean(apiKey && from), apiKey, from };
}

async function content(message: CredentialEmail) {
  const qr = await QRCode.toBuffer(message.credential, { width: 520, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b2e4f", light: "#ffffff" } });
  const safe = Object.fromEntries(Object.entries(message).map(([key, value]) => [key, escapeHtml(value)])) as Record<keyof CredentialEmail, string>;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f7f5;font-family:Arial,sans-serif;color:#15302a"><div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #dce9e3;border-radius:18px;padding:28px;text-align:center"><p style="margin:0;color:#247256;font-size:12px;font-weight:700;letter-spacing:.12em">CREDENCIAL DE CONGRESO</p><h1 style="font-size:25px;margin:12px 0 4px">${safe.studentName}</h1><p style="margin:0 0 20px;color:#62736d">${safe.enrollment} · ${safe.program}</p><img src="cid:credential-qr" width="260" height="260" alt="Código QR de acceso" style="display:block;margin:0 auto;border:8px solid #fff"><p style="font-size:17px;font-weight:700">${safe.eventName}</p><p style="font-size:13px;color:#62736d">Presenta este QR en cada acceso. No lo compartas con otras personas.</p><p style="font-family:monospace;font-size:11px;overflow-wrap:anywhere;color:#52635d">${safe.credential}</p></div></div></body></html>`;
  return { html, qr };
}

export async function sendCredentialEmail(message: CredentialEmail): Promise<EmailResult> {
  const configuration = resendConfiguration();
  if (!configuration.configured || !configuration.apiKey || !configuration.from) {
    throw new Error("Faltan RESEND_API_KEY o EMAIL_FROM");
  }
  const body = await content(message);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: configuration.from,
      to: [message.to],
      subject: `Tu credencial para ${message.eventName}`,
      html: body.html,
      attachments: [{ filename: "credencial-qr.png", content: body.qr.toString("base64"), content_id: "credential-qr" }]
    })
  });
  const result = await response.json() as { id?: string; message?: string };
  if (!response.ok || !result.id) throw new Error(result.message ?? `Resend respondió ${response.status}`);
  return { provider: "resend", messageId: result.id };
}
