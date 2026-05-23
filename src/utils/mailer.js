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

function fromAddress() {
  const siteName = process.env.SITE_NAME || 'Sharely';
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  return `"${siteName}" <${addr}>`;
}

async function sendPasswordResetEmail(to, username, resetUrl) {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const transporter = createTransport();
  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: `Reset your ${siteName} password`,
    text: [
      `Hi ${username},`,
      '',
      `You requested a password reset for your ${siteName} account.`,
      `Click the link below to set a new password. This link is valid for 1 hour and can only be used once.`,
      '',
      resetUrl,
      '',
      `If you did not request this, you can safely ignore this email.`,
      '',
      `— ${siteName}`,
    ].join('\n'),
    html: `<p>Hi <strong>${username}</strong>,</p>
<p>You requested a password reset for your <strong>${siteName}</strong> account.</p>
<p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Reset my password</a></p>
<p style="color:#666;font-size:13px;">This link is valid for <strong>1 hour</strong> and can only be used once.<br>If you did not request this, you can safely ignore this email.</p>
<p style="color:#999;font-size:12px;">— ${siteName}</p>`,
  });
}

async function sendEmailVerificationEmail(to, username, verifyUrl) {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const transporter = createTransport();
  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: `Verify your ${siteName} email address`,
    text: [
      `Hi ${username},`,
      '',
      `Please verify your email address for your ${siteName} account by clicking the link below.`,
      `This link is valid for 24 hours.`,
      '',
      verifyUrl,
      '',
      `If you did not request this, you can safely ignore this email.`,
      '',
      `— ${siteName}`,
    ].join('\n'),
    html: `<p>Hi <strong>${username}</strong>,</p>
<p>Please verify your email address for your <strong>${siteName}</strong> account.</p>
<p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Verify email address</a></p>
<p style="color:#666;font-size:13px;">This link is valid for <strong>24 hours</strong>.<br>If you did not request this, you can safely ignore this email.</p>
<p style="color:#999;font-size:12px;">— ${siteName}</p>`,
  });
}

module.exports = { isConfigured, sendPasswordResetEmail, sendEmailVerificationEmail };
