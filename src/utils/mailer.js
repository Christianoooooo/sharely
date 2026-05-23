const nodemailer = require('nodemailer');

// ── Translations ─────────────────────────────────────────────────────────────

const T = {
  en: {
    verify: {
      subject: (s) => `Verify your ${s} email address`,
      preheader: (s) => `Verify your email address for ${s}.`,
      title: 'Verify your email address',
      body: (u, s) => `Hi <strong style="color:#f0f4f8;">${u}</strong>,<br><br>Please verify your email address to finish setting up your ${s} account.<br>Click the button below to confirm. This link is valid for <strong style="color:#f0f4f8;">24 hours</strong>.`,
      cta: 'Verify email address',
      footer: (s) => `If you didn't create an account on ${s}, you can safely ignore this email.`,
    },
    reset: {
      subject: (s) => `Reset your ${s} password`,
      preheader: (s) => `Reset your ${s} password — link valid for 1 hour.`,
      title: 'Reset your password',
      body: (u, s) => `Hi <strong style="color:#f0f4f8;">${u}</strong>,<br><br>We received a request to reset the password for your ${s} account.<br>Click the button below to choose a new password. This link is valid for <strong style="color:#f0f4f8;">1 hour</strong> and can only be used once.`,
      cta: 'Reset password',
      footer: () => `If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.`,
    },
    fallbackBtn: `If the button doesn't work, copy and paste this link:`,
  },
  de: {
    verify: {
      subject: (s) => `E-Mail-Adresse für ${s} bestätigen`,
      preheader: (s) => `Bestätige deine E-Mail-Adresse für ${s}.`,
      title: 'E-Mail-Adresse bestätigen',
      body: (u, s) => `Hallo <strong style="color:#f0f4f8;">${u}</strong>,<br><br>bitte bestätige deine E-Mail-Adresse, um die Einrichtung deines ${s}-Kontos abzuschließen.<br>Klicke auf den Button. Dieser Link ist <strong style="color:#f0f4f8;">24 Stunden</strong> gültig.`,
      cta: 'E-Mail-Adresse bestätigen',
      footer: (s) => `Falls du kein Konto bei ${s} erstellt hast, kannst du diese E-Mail ignorieren.`,
    },
    reset: {
      subject: (s) => `Passwort für ${s} zurücksetzen`,
      preheader: (s) => `Setze dein ${s}-Passwort zurück – Link gültig für 1 Stunde.`,
      title: 'Passwort zurücksetzen',
      body: (u, s) => `Hallo <strong style="color:#f0f4f8;">${u}</strong>,<br><br>wir haben eine Anfrage zum Zurücksetzen des Passworts für dein ${s}-Konto erhalten.<br>Klicke auf den Button, um ein neues Passwort zu wählen. Dieser Link ist <strong style="color:#f0f4f8;">1 Stunde</strong> gültig und kann nur einmal verwendet werden.`,
      cta: 'Passwort zurücksetzen',
      footer: () => `Falls du keine Passwortzurücksetzung angefordert hast, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.`,
    },
    fallbackBtn: `Falls der Button nicht funktioniert, kopiere diesen Link:`,
  },
  fr: {
    verify: {
      subject: (s) => `Vérifiez votre adresse e-mail ${s}`,
      preheader: (s) => `Confirmez votre adresse e-mail pour ${s}.`,
      title: 'Vérifiez votre adresse e-mail',
      body: (u, s) => `Bonjour <strong style="color:#f0f4f8;">${u}</strong>,<br><br>veuillez vérifier votre adresse e-mail pour finaliser la configuration de votre compte ${s}.<br>Cliquez sur le bouton ci-dessous. Ce lien est valable <strong style="color:#f0f4f8;">24 heures</strong>.`,
      cta: "Vérifier l'adresse e-mail",
      footer: (s) => `Si vous n'avez pas créé de compte sur ${s}, vous pouvez ignorer cet e-mail.`,
    },
    reset: {
      subject: (s) => `Réinitialiser votre mot de passe ${s}`,
      preheader: (s) => `Réinitialisez votre mot de passe ${s} — lien valable 1 heure.`,
      title: 'Réinitialiser votre mot de passe',
      body: (u, s) => `Bonjour <strong style="color:#f0f4f8;">${u}</strong>,<br><br>nous avons reçu une demande de réinitialisation du mot de passe de votre compte ${s}.<br>Cliquez sur le bouton pour choisir un nouveau mot de passe. Ce lien est valable <strong style="color:#f0f4f8;">1 heure</strong> et ne peut être utilisé qu'une seule fois.`,
      cta: 'Réinitialiser le mot de passe',
      footer: () => `Si vous n'avez pas demandé de réinitialisation, ignorez cet e-mail — votre mot de passe restera inchangé.`,
    },
    fallbackBtn: `Si le bouton ne fonctionne pas, copiez ce lien :`,
  },
  es: {
    verify: {
      subject: (s) => `Verifica tu dirección de correo en ${s}`,
      preheader: (s) => `Confirma tu dirección de correo para ${s}.`,
      title: 'Verifica tu dirección de correo',
      body: (u, s) => `Hola <strong style="color:#f0f4f8;">${u}</strong>,<br><br>por favor verifica tu dirección de correo para finalizar la configuración de tu cuenta en ${s}.<br>Haz clic en el botón. Este enlace es válido por <strong style="color:#f0f4f8;">24 horas</strong>.`,
      cta: 'Verificar dirección de correo',
      footer: (s) => `Si no creaste una cuenta en ${s}, puedes ignorar este correo.`,
    },
    reset: {
      subject: (s) => `Restablecer contraseña de ${s}`,
      preheader: (s) => `Restablece tu contraseña de ${s} — enlace válido por 1 hora.`,
      title: 'Restablecer tu contraseña',
      body: (u, s) => `Hola <strong style="color:#f0f4f8;">${u}</strong>,<br><br>recibimos una solicitud para restablecer la contraseña de tu cuenta en ${s}.<br>Haz clic en el botón para elegir una nueva contraseña. Este enlace es válido por <strong style="color:#f0f4f8;">1 hora</strong> y solo puede usarse una vez.`,
      cta: 'Restablecer contraseña',
      footer: () => `Si no solicitaste un restablecimiento de contraseña, ignora este correo — tu contraseña no cambiará.`,
    },
    fallbackBtn: `Si el botón no funciona, copia este enlace:`,
  },
  it: {
    verify: {
      subject: (s) => `Verifica il tuo indirizzo email su ${s}`,
      preheader: (s) => `Conferma il tuo indirizzo email per ${s}.`,
      title: 'Verifica il tuo indirizzo email',
      body: (u, s) => `Ciao <strong style="color:#f0f4f8;">${u}</strong>,<br><br>verifica il tuo indirizzo email per completare la configurazione del tuo account su ${s}.<br>Clicca sul pulsante. Questo link è valido per <strong style="color:#f0f4f8;">24 ore</strong>.`,
      cta: "Verifica l'indirizzo email",
      footer: (s) => `Se non hai creato un account su ${s}, puoi ignorare questa email.`,
    },
    reset: {
      subject: (s) => `Reimposta la password di ${s}`,
      preheader: (s) => `Reimposta la tua password di ${s} — link valido per 1 ora.`,
      title: 'Reimposta la tua password',
      body: (u, s) => `Ciao <strong style="color:#f0f4f8;">${u}</strong>,<br><br>abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account su ${s}.<br>Clicca sul pulsante per scegliere una nuova password. Questo link è valido per <strong style="color:#f0f4f8;">1 ora</strong> e può essere usato una sola volta.`,
      cta: 'Reimposta la password',
      footer: () => `Se non hai richiesto la reimpostazione, ignora questa email — la tua password rimarrà invariata.`,
    },
    fallbackBtn: `Se il pulsante non funziona, copia questo link:`,
  },
  pt: {
    verify: {
      subject: (s) => `Verifique seu endereço de e-mail no ${s}`,
      preheader: (s) => `Confirme seu endereço de e-mail para ${s}.`,
      title: 'Verifique seu endereço de e-mail',
      body: (u, s) => `Olá <strong style="color:#f0f4f8;">${u}</strong>,<br><br>por favor verifique seu endereço de e-mail para concluir a configuração da sua conta no ${s}.<br>Clique no botão. Este link é válido por <strong style="color:#f0f4f8;">24 horas</strong>.`,
      cta: 'Verificar endereço de e-mail',
      footer: (s) => `Se você não criou uma conta no ${s}, pode ignorar este e-mail.`,
    },
    reset: {
      subject: (s) => `Redefinir senha do ${s}`,
      preheader: (s) => `Redefina sua senha do ${s} — link válido por 1 hora.`,
      title: 'Redefinir sua senha',
      body: (u, s) => `Olá <strong style="color:#f0f4f8;">${u}</strong>,<br><br>recebemos uma solicitação para redefinir a senha da sua conta no ${s}.<br>Clique no botão para escolher uma nova senha. Este link é válido por <strong style="color:#f0f4f8;">1 hora</strong> e só pode ser usado uma vez.`,
      cta: 'Redefinir senha',
      footer: () => `Se você não solicitou a redefinição de senha, ignore este e-mail — sua senha permanecerá inalterada.`,
    },
    fallbackBtn: `Se o botão não funcionar, copie este link:`,
  },
  ja: {
    verify: {
      subject: (s) => `${s} のメールアドレスを確認してください`,
      preheader: (s) => `${s} のメールアドレスを確認してください。`,
      title: 'メールアドレスの確認',
      body: (u, s) => `こんにちは <strong style="color:#f0f4f8;">${u}</strong>、<br><br>${s} アカウントの設定を完了するには、メールアドレスを確認してください。<br>以下のボタンをクリックしてください。このリンクは <strong style="color:#f0f4f8;">24時間</strong> 有効です。`,
      cta: 'メールアドレスを確認する',
      footer: (s) => `${s} でアカウントを作成していない場合は、このメールを無視してください。`,
    },
    reset: {
      subject: (s) => `${s} のパスワードをリセットしてください`,
      preheader: (s) => `${s} のパスワードをリセット — リンクは1時間有効です。`,
      title: 'パスワードのリセット',
      body: (u, s) => `こんにちは <strong style="color:#f0f4f8;">${u}</strong>、<br><br>${s} アカウントのパスワードリセットのリクエストを受け取りました。<br>以下のボタンをクリックして新しいパスワードを設定してください。このリンクは <strong style="color:#f0f4f8;">1時間</strong> 有効で、一度しか使用できません。`,
      cta: 'パスワードをリセットする',
      footer: () => `パスワードリセットを要求していない場合は、このメールを無視してください。パスワードは変更されません。`,
    },
    fallbackBtn: `ボタンが機能しない場合は、このリンクをコピーしてください:`,
  },
  zh: {
    verify: {
      subject: (s) => `验证您在 ${s} 的电子邮件地址`,
      preheader: (s) => `请确认您在 ${s} 的电子邮件地址。`,
      title: '验证您的电子邮件地址',
      body: (u, s) => `您好 <strong style="color:#f0f4f8;">${u}</strong>，<br><br>请验证您的电子邮件地址以完成 ${s} 账户的设置。<br>点击下方按钮进行确认。此链接有效期为 <strong style="color:#f0f4f8;">24小时</strong>。`,
      cta: '验证电子邮件地址',
      footer: (s) => `如果您没有在 ${s} 创建账户，请忽略此邮件。`,
    },
    reset: {
      subject: (s) => `重置您的 ${s} 密码`,
      preheader: (s) => `重置您的 ${s} 密码 — 链接有效期1小时。`,
      title: '重置您的密码',
      body: (u, s) => `您好 <strong style="color:#f0f4f8;">${u}</strong>，<br><br>我们收到了重置您 ${s} 账户密码的请求。<br>点击下方按钮设置新密码。此链接有效期为 <strong style="color:#f0f4f8;">1小时</strong>，且只能使用一次。`,
      cta: '重置密码',
      footer: () => `如果您没有请求密码重置，请忽略此邮件 — 您的密码将保持不变。`,
    },
    fallbackBtn: `如果按钮无效，请复制以下链接:`,
  },
};

function t(lang, type) {
  return T[lang]?.[type] ? T[lang][type] : T['en'][type];
}

// ── Transport ────────────────────────────────────────────────────────────────

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

// ── Template ─────────────────────────────────────────────────────────────────

function buildHtml({ siteName, baseUrl, preheader, title, body, ctaLabel, ctaUrl, footerNote, fallbackBtn }) {
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

        <tr>
          <td align="center" style="padding-bottom:36px;">
            <a href="${baseUrl}" style="text-decoration:none;display:inline-block;">
              <img src="${logoUrl}" width="28" height="28" alt="${siteName}" style="display:inline-block;vertical-align:middle;margin-right:10px;">
              <span style="font-size:14px;font-weight:700;letter-spacing:0.18em;color:#3c83f6;text-transform:uppercase;vertical-align:middle;">${siteName}</span>
            </a>
          </td>
        </tr>

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
              ${fallbackBtn}<br>
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

function buildText({ siteName, baseUrl, preheader, title, body, ctaLabel, ctaUrl, footerNote, fallbackBtn }) {
  const lines = [`[ ${siteName.toUpperCase()} ]`, '', title, '—'.repeat(40), '', body.replace(/<[^>]+>/g, ''), ''];
  if (ctaLabel && ctaUrl) {
    lines.push(`${ctaLabel}:`);
    lines.push(ctaUrl);
    lines.push('');
  }
  lines.push(footerNote.replace(/<[^>]+>/g, ''), '', `— ${siteName} · ${baseUrl}`);
  return lines.join('\n');
}

// ── Public API ───────────────────────────────────────────────────────────────

async function sendPasswordResetEmail(to, username, resetUrl, lang = 'en') {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const baseUrl = process.env.BASE_URL || '';
  const tr = t(lang, 'reset');
  const fallbackBtn = T[lang]?.fallbackBtn ?? T.en.fallbackBtn;

  const params = {
    siteName, baseUrl,
    preheader: tr.preheader(siteName),
    title: tr.title,
    body: tr.body(username, siteName),
    ctaLabel: tr.cta,
    ctaUrl: resetUrl,
    footerNote: tr.footer(siteName),
    fallbackBtn,
  };

  await createTransport().sendMail({
    from: fromAddress(siteName),
    to,
    subject: tr.subject(siteName),
    text: buildText(params),
    html: buildHtml(params),
  });
}

async function sendEmailVerificationEmail(to, username, verifyUrl, lang = 'en') {
  if (!isConfigured()) throw new Error('SMTP not configured');
  const siteName = process.env.SITE_NAME || 'Sharely';
  const baseUrl = process.env.BASE_URL || '';
  const tr = t(lang, 'verify');
  const fallbackBtn = T[lang]?.fallbackBtn ?? T.en.fallbackBtn;

  const params = {
    siteName, baseUrl,
    preheader: tr.preheader(siteName),
    title: tr.title,
    body: tr.body(username, siteName),
    ctaLabel: tr.cta,
    ctaUrl: verifyUrl,
    footerNote: tr.footer(siteName),
    fallbackBtn,
  };

  await createTransport().sendMail({
    from: fromAddress(siteName),
    to,
    subject: tr.subject(siteName),
    text: buildText(params),
    html: buildHtml(params),
  });
}

module.exports = { isConfigured, sendPasswordResetEmail, sendEmailVerificationEmail };
