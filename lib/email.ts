import nodemailer from "nodemailer";

// SMTP login for the Gmail account used to send app emails.
// Prefers EMAIL_USER / EMAIL_PASS; falls back to the legacy GMAIL_USER / GMAIL_APP_PASSWORD names.
export const EMAIL_USER = process.env.EMAIL_USER || process.env.GMAIL_USER;
export const EMAIL_PASS =
  process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD;

export function getTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Use TLS (STARTTLS)
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });
}

export function birthdayEmailHtml(memberName: string) {
  const churchName = process.env.CHURCH_NAME || "Our Church";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      <h2>Happy Birthday, ${memberName}!</h2>
      <p>Dear ${memberName},</p>
      <p>Happy Birthday from all of us at <strong>${churchName}</strong>!</p>
      <p>We thank God for you and pray that this new year brings you joy, peace, and abundant blessings.</p>
      <p>With love,<br/>${churchName} Family</p>
    </div>
  `;
}

export async function sendBirthdayEmail(to: string, memberName: string) {
  const transporter = getTransporter();
  const churchName = process.env.CHURCH_NAME || "Our Church";
  return transporter.sendMail({
    from: `"${churchName}" <${EMAIL_USER}>`,
    to,
    subject: `Happy Birthday ${memberName}!`,
    html: birthdayEmailHtml(memberName),
  });
}
