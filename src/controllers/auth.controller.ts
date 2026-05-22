import { Request, Response } from 'express';
import type { Provider } from '@supabase/auth-js';
import { supabase } from '../config/supabase';

export class AuthController {
  // 1. Khởi tạo OAuth flow (Redirect client tới provider)
  public async signInWithOAuth(req: Request, res: Response): Promise<void> {
    try {
      const provider = req.params.provider as Provider; // e.g. 'google', 'facebook', 'github'

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Bạn có thể redirect về frontend, hoặc redirect về /api/auth/callback để server xử lý
          redirectTo: `${process.env.CLIENT_URL}/auth/callback`,
        },
      });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      // Trả về URL để frontend tự chuyển hướng, hoặc server chuyển hướng luôn
      // redirect qua trình duyệt
      if (data.url) {
        res.redirect(data.url);
        return;
      }

      res.status(200).json(data);
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  }

  // 2. Server-Side Callback (Tuỳ chọn: Nếu bạn redirect về server để xử lý token code)
  // Trong trường hợp dùng PKCE flow
  public async oauthCallback(req: Request, res: Response): Promise<void> {
    const { code } = req.query;

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
      if (error) {
        res.redirect(`${process.env.CLIENT_URL}/login?error=OAuthFailed`);
        return;
      }

      // Có thể lưu refresh_token vào httpOnly cookie ở đây để bảo mật
      // res.cookie('refresh_token', data.session.refresh_token, { httpOnly: true, secure: true });

      // Chuyển hướng người dùng về trang chủ ở frontend sau khi đăng nhập thành công
      res.redirect(`${process.env.CLIENT_URL}/?login=success`);
      return;
    }

    res.redirect(`${process.env.CLIENT_URL}/login?error=InvalidCode`);
  }

  // 3. Cơ chế Refresh Token chuẩn
  public async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      // Refresh token có thể lấy từ Body hoặc Cookies
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

      // Cập nhật lại cookie nếu bạn dùng httpOnly cookie
      // res.cookie('refresh_token', data.session?.refresh_token, { httpOnly: true, secure: true, sameSite: 'strict' });

      res.status(200).json({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token, // Chỉ gửi về nếu frontend tự lưu (không dùng cookie)
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
        // Cần truyền token vào cho supabase client hiểu đang log out ai
        await supabase.auth.signOut();
      }

      res.clearCookie('refresh_token');
      res.status(200).json({ message: 'Đăng xuất thành công' });
    } catch (err: any) {
      res.status(500).json({ error: 'Lỗi server' });
    }
  }
}
