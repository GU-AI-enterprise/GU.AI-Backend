import { Request, Response } from 'express';
import type { Provider } from '@supabase/auth-js';
import { supabase, supabaseAdmin } from '../config/supabase';
import { EmailService } from '../services/email.service';

export class AuthController {
  // 0. Đăng ký — tạo user chưa xác nhận, gửi email xác nhận qua Resend
  public async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email và mật khẩu là bắt buộc.' });
        return;
      }

      if (!supabaseAdmin) {
        res.status(500).json({ error: 'Admin client chưa được cấu hình.' });
        return;
      }

      const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();

      // generateLink creates user (unconfirmed) and returns the confirmation URL.
      // The on_auth_user_created trigger fires immediately → public.users row created.
      // User cannot log in until they click the verification link.
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
          data: { name: name || '' },
          redirectTo: `${clientUrl}/auth/callback`,
        },
      });

      if (error) {
        const status = error.message.includes('already registered') ? 409 : 400;
        res.status(status).json({ error: error.message });
        return;
      }

      // Non-blocking — email failure doesn't affect registration response
      EmailService.sendVerificationEmail(email, name || '', data.properties.action_link);

      res.status(201).json({
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác nhận tài khoản.',
        requiresVerification: true,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  }

  // 0b. Gửi lại email xác nhận (dùng Supabase native resend)
  public async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email là bắt buộc.' });
        return;
      }

      const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${clientUrl}/auth/callback` },
      });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.json({ message: 'Email xác nhận đã được gửi lại. Vui lòng kiểm tra hộp thư.' });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  }

  // 1. Khởi tạo OAuth flow (Redirect client tới provider)
  public async signInWithOAuth(req: Request, res: Response): Promise<void> {
    try {
      const provider = req.params.provider as Provider; // e.g. 'google', 'facebook', 'github'

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${process.env.CLIENT_URL}/auth/callback`,
        },
      });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      if (data.url) {
        res.redirect(data.url);
        return;
      }

      res.status(200).json(data);
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  }

  // 2. Server-Side Callback (PKCE flow)
  public async oauthCallback(req: Request, res: Response): Promise<void> {
    const { code } = req.query;

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
      if (error) {
        res.redirect(`${process.env.CLIENT_URL}/login?error=OAuthFailed`);
        return;
      }

      res.redirect(`${process.env.CLIENT_URL}/?login=success`);
      return;
    }

    res.redirect(`${process.env.CLIENT_URL}/login?error=InvalidCode`);
  }

  // 3. Refresh Token
  public async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body.refresh_token;

      if (!refreshToken) {
        res.status(401).json({ error: 'Không tìm thấy refresh token.' });
        return;
      }

      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

      if (error) {
        res.status(401).json({ error: 'Refresh token không hợp lệ hoặc đã hết hạn.' });
        return;
      }

      res.status(200).json({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        user: data.user,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  }

  // 4. Logout
  public async logout(req: Request, res: Response): Promise<void> {
    try {
      const accessToken = req.headers.authorization?.split(' ')[1];

      if (accessToken) {
        await supabase.auth.signOut();
      }

      res.clearCookie('refresh_token');
      res.status(200).json({ message: 'Đăng xuất thành công' });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server' });
    }
  }
}
