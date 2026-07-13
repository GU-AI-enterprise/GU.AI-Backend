import { Request, Response } from 'express';
import type { Provider } from '@supabase/auth-js';
import { supabase, supabaseAdmin } from '../config/supabase';

export class AuthController {
  // 0. Đăng ký — tạo user đã xác nhận sẵn, đăng nhập được ngay (không gửi email xác nhận)
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

      // email_confirm: true — user is created already-confirmed so
      // signInWithPassword works immediately, no verification link needed.
      // The on_auth_user_created trigger fires immediately → public.users row created.
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || '' },
      });

      if (error) {
        const status = /already.*registered/i.test(error.message) ? 409 : 400;
        res.status(status).json({ error: error.message });
        return;
      }

      res.status(201).json({
        message: 'Đăng ký thành công. Bạn có thể đăng nhập ngay.',
      });
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
