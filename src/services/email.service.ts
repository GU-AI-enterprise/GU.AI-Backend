import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'GU.AI <noreply@guai.com.vn>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GU.AI</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f0f0f 0%,#1a1a2e 100%);padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                GU<span style="color:#a78bfa;">.</span>AI
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:3px;text-transform:uppercase;margin-top:4px;">
                AI Fashion Studio
              </div>
            </td>
          </tr>
          <!-- Content -->
          ${content}
          <!-- Footer -->
          <tr>
            <td style="background:#fafafa;border-top:1px solid #f0f0f0;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
                Email này được gửi từ <strong>GU.AI</strong> — AI Fashion Studio.<br/>
                Nếu bạn không thực hiện hành động này, hãy bỏ qua email này.<br/><br/>
                <a href="${APP_URL}" style="color:#a78bfa;text-decoration:none;">guai.com.vn</a>
                &nbsp;·&nbsp;
                <a href="mailto:support@guai.com.vn" style="color:#a78bfa;text-decoration:none;">support@guai.com.vn</a>
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

function welcomeBody(name: string): string {
  const displayName = name || 'bạn';
  return baseLayout(`
  <tr>
    <td style="padding:40px 40px 32px;">
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0f0f0f;letter-spacing:-0.3px;">
        Chào mừng đến với GU.AI! 🎉
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7;">
        Xin chào <strong>${displayName}</strong>,<br/>
        Tài khoản của bạn đã được tạo thành công. Hãy bắt đầu hành trình tạo ảnh mẫu thời trang AI đỉnh cao!
      </p>

      <!-- Feature highlights -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
        <tr>
          <td style="background:#f9f7ff;border-radius:12px;padding:20px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#444;border-bottom:1px solid #ede9fe;">
                  <span style="color:#a78bfa;font-size:16px;">✦</span>&nbsp;&nbsp;
                  <strong>Virtual Try-On</strong> — Thử quần áo trên model ảo
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#444;border-bottom:1px solid #ede9fe;">
                  <span style="color:#a78bfa;font-size:16px;">✦</span>&nbsp;&nbsp;
                  <strong>Face Swap</strong> — Ghép khuôn mặt siêu thực tế
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#444;border-bottom:1px solid #ede9fe;">
                  <span style="color:#a78bfa;font-size:16px;">✦</span>&nbsp;&nbsp;
                  <strong>AI Workflow</strong> — Tự động hóa quy trình ảnh thời trang
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#444;">
                  <span style="color:#a78bfa;font-size:16px;">✦</span>&nbsp;&nbsp;
                  <strong>Tài khoản mới</strong> — Nhận credits miễn phí để trải nghiệm
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin:0 0 8px;">
        <a href="${APP_URL}/studio"
           style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;letter-spacing:0.2px;">
          Bắt đầu tạo ảnh ngay →
        </a>
      </div>
      <p style="margin:16px 0 0;font-size:13px;color:#999;text-align:center;">
        Hoặc đăng nhập tại <a href="${APP_URL}/login" style="color:#a78bfa;text-decoration:none;">${APP_URL}/login</a>
      </p>
    </td>
  </tr>`);
}

function billBody(opts: {
  name: string;
  orderCode: string | number;
  packageName: string;
  amount: number;
  creditAmount: number;
  bonusCredit: number;
  newBalance: number;
  paidAt: string;
}): string {
  const { name, orderCode, packageName, amount, creditAmount, bonusCredit, newBalance, paidAt } = opts;
  const totalCredits = creditAmount + bonusCredit;
  const creditLabel = bonusCredit > 0
    ? `${creditAmount.toLocaleString('vi-VN')} + ${bonusCredit.toLocaleString('vi-VN')} bonus`
    : totalCredits.toLocaleString('vi-VN');
  const formattedDate = new Date(paidAt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return baseLayout(`
  <tr>
    <td style="padding:40px 40px 32px;">
      <!-- Success badge -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#f0fdf4;border:1.5px solid #86efac;border-radius:50px;padding:8px 20px;">
          <span style="color:#16a34a;font-size:14px;font-weight:600;">✓ Thanh toán thành công</span>
        </div>
      </div>

      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0f0f0f;text-align:center;">
        Biên lai thanh toán
      </h1>
      <p style="margin:0 0 28px;font-size:14px;color:#777;text-align:center;">
        Xin chào <strong>${name || 'bạn'}</strong>, giao dịch của bạn đã được xác nhận.
      </p>

      <!-- Transaction table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #ede9fe;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <tr style="background:#f9f7ff;">
          <td style="padding:12px 20px;font-size:12px;font-weight:600;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">
            Chi tiết giao dịch
          </td>
        </tr>
        <tr>
          <td style="padding:0 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${[
                ['Mã đơn hàng', `#${orderCode}`],
                ['Gói dịch vụ', packageName],
                ['Số tiền thanh toán', `${Math.round(amount).toLocaleString('vi-VN')} ₫`],
                ['Credits nhận được', `+${creditLabel} credits`],
                ['Số dư tài khoản', `${newBalance.toLocaleString('vi-VN')} credits`],
                ['Thời gian', formattedDate],
                ['Phương thức', 'PayOS'],
              ].map(([label, value], i, arr) => `
              <tr style="${i < arr.length - 1 ? 'border-bottom:1px solid #f3f0ff;' : ''}">
                <td style="padding:12px 20px;font-size:13px;color:#888;width:50%;">${label}</td>
                <td style="padding:12px 20px;font-size:13px;color:#111;font-weight:600;text-align:right;">${value}</td>
              </tr>`).join('')}
            </table>
          </td>
        </tr>
      </table>

      <!-- Balance highlight -->
      <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:8px;">
        <div style="font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Số dư hiện tại</div>
        <div style="font-size:32px;font-weight:700;color:#ffffff;">${newBalance.toLocaleString('vi-VN')}</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:2px;">credits</div>
      </div>

      <p style="margin:20px 0 0;font-size:13px;color:#999;text-align:center;">
        Sử dụng credits tại
        <a href="${APP_URL}/studio" style="color:#a78bfa;text-decoration:none;font-weight:600;">GU.AI Studio</a>
      </p>
    </td>
  </tr>`);
}

function verificationBody(name: string, confirmationLink: string): string {
  const displayName = name || 'bạn';
  return baseLayout(`
  <tr>
    <td style="padding:40px 40px 32px;text-align:center;">
      <!-- Icon -->
      <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#f9f7ff;border-radius:50%;margin-bottom:24px;">
        <span style="font-size:30px;">✉️</span>
      </div>

      <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#0f0f0f;letter-spacing:-0.3px;">
        Xác nhận địa chỉ email
      </h1>
      <p style="margin:0 0 28px;font-size:14px;color:#666;line-height:1.7;max-width:380px;margin-left:auto;margin-right:auto;">
        Xin chào <strong>${displayName}</strong>,<br/>
        Bạn đã đăng ký tài khoản GU.AI. Nhấn nút bên dưới để xác nhận email và bắt đầu sử dụng dịch vụ.
      </p>

      <!-- CTA Button -->
      <div style="margin:0 0 28px;">
        <a href="${confirmationLink}"
           style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 44px;border-radius:12px;letter-spacing:0.2px;">
          Xác nhận Email
        </a>
      </div>

      <!-- Warning -->
      <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:14px 20px;margin-bottom:20px;text-align:left;">
        <p style="margin:0;font-size:12px;color:#92400e;line-height:1.6;">
          ⚠️ <strong>Lưu ý:</strong> Link xác nhận có hiệu lực trong <strong>24 giờ</strong>.
          Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email này.
        </p>
      </div>

      <!-- Fallback link -->
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
        Nếu nút không hoạt động, copy và dán link sau vào trình duyệt:<br/>
        <span style="color:#7c3aed;word-break:break-all;font-size:11px;">${confirmationLink}</span>
      </p>
    </td>
  </tr>`);
}

export interface PaymentBillOptions {
  to: string;
  name: string;
  orderCode: string | number;
  packageName: string;
  amount: number;
  creditAmount: number;
  bonusCredit: number;
  newBalance: number;
  paidAt?: string;
}

export class EmailService {
  static async sendVerificationEmail(to: string, name: string, confirmationLink: string): Promise<void> {
    try {
      await resend.emails.send({
        from: FROM,
        to: [to],
        subject: 'Xác nhận email của bạn — GU.AI',
        html: verificationBody(name, confirmationLink),
      });
    } catch (err: any) {
      console.error('[EmailService] sendVerificationEmail failed:', err.message);
    }
  }

  static async sendWelcomeEmail(to: string, name: string): Promise<void> {
    try {
      await resend.emails.send({
        from: FROM,
        to: [to],
        subject: 'Chào mừng đến với GU.AI — Tài khoản của bạn đã sẵn sàng!',
        html: welcomeBody(name),
      });
    } catch (err: any) {
      console.error('[EmailService] sendWelcomeEmail failed:', err.message);
    }
  }

  static async sendPaymentBillEmail(opts: PaymentBillOptions): Promise<void> {
    try {
      await resend.emails.send({
        from: FROM,
        to: [opts.to],
        subject: `Biên lai thanh toán GU.AI — Mã #${opts.orderCode}`,
        html: billBody({
          name: opts.name,
          orderCode: opts.orderCode,
          packageName: opts.packageName,
          amount: opts.amount,
          creditAmount: opts.creditAmount,
          bonusCredit: opts.bonusCredit,
          newBalance: opts.newBalance,
          paidAt: opts.paidAt ?? new Date().toISOString(),
        }),
      });
    } catch (err: any) {
      console.error('[EmailService] sendPaymentBillEmail failed:', err.message);
    }
  }
}
