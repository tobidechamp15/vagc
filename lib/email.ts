import nodemailer from "nodemailer";

export function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
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
    from: `"${churchName}" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Happy Birthday ${memberName}!`,
    html: birthdayEmailHtml(memberName),
  });
}
