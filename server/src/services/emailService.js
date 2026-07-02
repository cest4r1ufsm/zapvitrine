const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const fromName = () => process.env.SMTP_FROM_NAME || 'AGTgestor';
const fromEmail = () => process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
const appUrl = () => process.env.APP_URL || 'http://localhost:3001';

async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${appUrl()}/verify-email?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A1A;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A1A;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#12122A;border-radius:16px;overflow:hidden;border:1px solid #2A2A4A;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6C63FF,#8B85FF);padding:40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">AGTgestor</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Sua vitrine digital com WhatsApp</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#fff;font-size:22px;margin:0 0 16px;">Olá, ${name}! 👋</h2>
            <p style="color:#A0A0C0;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Obrigado por se cadastrar no AGTgestor! Para ativar sua conta e começar a vender pelo WhatsApp, confirme seu endereço de e-mail clicando no botão abaixo.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C63FF,#8B85FF);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;letter-spacing:0.3px;">
                    Confirmar E-mail
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#6B6B8A;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
            </p>
            <p style="color:#6C63FF;font-size:13px;word-break:break-all;margin:0 0 32px;">
              ${verifyUrl}
            </p>
            <hr style="border:none;border-top:1px solid #2A2A4A;margin:0 0 24px;">
            <p style="color:#6B6B8A;font-size:12px;margin:0;">
              Este link expira em <strong style="color:#A0A0C0;">24 horas</strong>. Se você não criou uma conta no AGTgestor, ignore este e-mail.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0A0A1A;padding:20px 40px;text-align:center;">
            <p style="color:#3A3A5A;font-size:12px;margin:0;">© 2026 AGTgestor · Todos os direitos reservados</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    to: email,
    subject: 'Confirme seu e-mail - AGTgestor',
    html,
  });
}

async function sendPasswordResetEmail(email, name, token) {
  const resetUrl = `${appUrl()}/reset-password?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A1A;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A1A;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#12122A;border-radius:16px;overflow:hidden;border:1px solid #2A2A4A;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6C63FF,#8B85FF);padding:40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">AGTgestor</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Redefinição de senha</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#fff;font-size:22px;margin:0 0 16px;">Esqueceu sua senha, ${name}?</h2>
            <p style="color:#A0A0C0;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong style="color:#fff;">1 hora</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 32px;">
                  <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C63FF,#8B85FF);color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:12px;letter-spacing:0.3px;">
                    Redefinir Senha
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#6B6B8A;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
            </p>
            <p style="color:#6C63FF;font-size:13px;word-break:break-all;margin:0 0 32px;">
              ${resetUrl}
            </p>
            <hr style="border:none;border-top:1px solid #2A2A4A;margin:0 0 24px;">
            <p style="color:#6B6B8A;font-size:12px;margin:0;">
              Se você não solicitou a redefinição de senha, ignore este e-mail. Sua senha permanecerá a mesma.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#0A0A1A;padding:20px 40px;text-align:center;">
            <p style="color:#3A3A5A;font-size:12px;margin:0;">© 2026 AGTgestor · Todos os direitos reservados</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${fromName()}" <${fromEmail()}>`,
    to: email,
    subject: 'Redefinição de senha - AGTgestor',
    html,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
