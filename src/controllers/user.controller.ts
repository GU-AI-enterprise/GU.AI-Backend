import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthRequest } from '../middlewares/auth.middleware';

export class UserController {
  // Get current user profile
  public async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', req.user.id)
        .single();

      if (error) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.status(200).json(user);
    } catch (err: any) {
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }

  // Update user profile
  public async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { name, avatar_url } = req.body;

      const { data: user, error } = await supabase
        .from('users')
        .update({
          name: name || undefined,
          avatar_url: avatar_url || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.user.id)
        .select()
        .single();

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(200).json(user);
    } catch (err: any) {
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }

  // Change password
  public async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        res.status(400).json({ error: 'Current password and new password are required' });
        return;
      }

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password: current_password,
      });

      if (signInError) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: new_password,
      });

      if (updateError) {
        res.status(400).json({ error: updateError.message });
        return;
      }

      res.status(200).json({ message: 'Password updated successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }

  // Delete account
  public async deleteAccount(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { password } = req.body;

      if (!password) {
        res.status(400).json({ error: 'Password is required to delete account' });
        return;
      }

      // Verify password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password,
      });

      if (signInError) {
        res.status(400).json({ error: 'Password is incorrect' });
        return;
      }

      // Delete user from database
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', req.user.id);

      if (deleteError) {
        res.status(400).json({ error: deleteError.message });
        return;
      }

      // Delete auth user
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
        req.user.id
      );

      if (authDeleteError) {
        res.status(400).json({ error: authDeleteError.message });
        return;
      }

      res.status(200).json({ message: 'Account deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: 'Server error', details: err.message });
    }
  }
}
