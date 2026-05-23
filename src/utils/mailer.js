const nodemailer = require('nodemailer');

function isConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function fromAddress(siteName) {
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  return `"${siteName}" <${addr}>`;
}

function buildHtml({ siteName, baseUrl, preheader, title, body, ctaLabel, ctaUrl, footerNote }) {
  const logoUrl = `${baseUrl}/favicon.svg`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${siteName}</title>
</head>
<body style="margin:0;padding:0;background-color:#060a12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#060a12;">${preheader}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>

<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#060a12;">
  <tr>
    <td align="center" style="padding:48px 16px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;">

        <!-- Logo + brand name -->
        <tr>
          <td align="center" style="padding-bottom:36px;">
            <a href="${baseUrl}" style="text-decoration:none;display:inline-block;">
              <img src="${logoUrl}" width="28" height="28" alt="${siteName}" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <span style="font-size:14px;font-weight:700;letter-spacing:0.18em;color:#3c83f6;text-transform:uppercase;vertical-align:middle;">${siteName}</span>
            </a>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background-color:#0d1525;border-radius:12px;border:1px solid #1a2332;padding:40px 40px 36px;">

            <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f0f4f8;line-height:1.3;">${title}</h1>

            <div style="font-size:15px;color:#8a9bb0;line-height:1.7;margin-bottom:32px;">${body}</div>

            ${ctaLabel && ctaUrl ? `
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px;">
              <tr>
                <td style="border-radius:8px;background-color:#3c83f6;">
                  <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;background-color:#3c83f6;color:#060a12;font-size:15px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">${ctaLabel}</a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 32px;font-size:13px;color:#6b7a8a;line-height:1.6;">
              If the button doesn't work, copy and paste this link:<br>
              <a href="${ctaUrl}" style="color:#3c83f6;word-break:break-all;">${ctaUrl}</a>
            </p>
            ` : ''}

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr><td style="border-top:1px solid #1a2332;padding-top:28px;">
                <p style="margin:0;font-size:13px;color:#4d6070;line-height:1.6;">${footerNote}</p>
              </td></tr>
            </table>

          </td>
        </tr>

        <!-- Bottom footer -->
        <tr>
          <td align="center" style="padding-top:28px;">
            <p style="margin:0;font-size:12px;color:#2d3f52;">
              Sent by <span style="color:#3c83f6;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">${siteName}</span>
              &nbsp;·&nbsp;
              <a href="${baseUrl}" style="color:#2d3f52;text-decoration:underline;">${baseUrl}</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildText({ siteName, baseUrl, preheader, title, body, ctaLabel, ctaUrl, footerNote }) {
  const lines = [
    `[ ${siteName.toUpperCase()} ]`,
    '',
    title,
    '—'.repeat(40),
    '',
    body.replace(/<[^>]+>/g, ''),
    '',
  ];
  if (ctaLabel && ctaUrl) {
    lines.push(`${ctaLabel}:`);
    lines.push(ctaUrl);
    lines.push('');
  }
  lines.push(footerNote.replace(/<[^>]+>/g, ''));
  lines.push('');
  lines.push(`— ${siteName} · ${baseUrl}`);
  return lines.join('\n');
}

async function sendPasswordResetEmail(to, username, resetUrl) {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const baseUrl = process.env.BASE_URL || '';

  const params = {
    siteName,
    baseUrl,
    preheader: `Reset your ${siteName} password — link valid for 1 hour.`,
    title: 'Reset your password',
    body: `Hi <strong style="color:#f0f4f8;">${username}</strong>,<br><br>
We received a request to reset the password for your ${siteName} account.<br>
Click the button below to choose a new password. This link is valid for <strong style="color:#f0f4f8;">1 hour</strong> and can only be used once.`,
    ctaLabel: 'Reset password',
    ctaUrl: resetUrl,
    footerNote: `If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.`,
  };

  await createTransport().sendMail({
    from: fromAddress(siteName),
    to,
    subject: `Reset your ${siteName} password`,
    text: buildText(params),
    html: buildHtml(params),
  });
}

async function sendEmailVerificationEmail(to, username, verifyUrl) {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const baseUrl = process.env.BASE_URL || '';

  const params = {
    siteName,
    baseUrl,
    preheader: `Verify your email address for ${siteName}.`,
    title: 'Verify your email address',
    body: `Hi <strong style="color:#f0f4f8;">${username}</strong>,<br><br>
Please verify your email address to finish setting up your ${siteName} account.<br>
Click the button below to confirm. This link is valid for <strong style="color:#f0f4f8;">24 hours</strong>.`,
    ctaLabel: 'Verify email address',
    ctaUrl: verifyUrl,
    footerNote: `If you didn't create an account on ${siteName}, you can safely ignore this email.`,
  };

  await createTransport().sendMail({
    from: fromAddress(siteName),
    to,
    subject: `Verify your ${siteName} email address`,
    text: buildText(params),
    html: buildHtml(params),
  });
}

module.exports = { isConfigured, sendPasswordResetEmail, sendEmailVerificationEmail };
