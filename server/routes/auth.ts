import { Router } from 'express';
import passport from '../config/passport.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

// Google OAuth login
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
  }),
  (req, res) => {
    // Store user ID in session
    if (req.user) {
      req.session.userId = (req.user as any).id;
      req.session.save(() => {
        res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173');
      });
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/login?error=no_user`);
    }
  }
);

// Get current user
router.get('/me', isAuthenticated, (req, res) => {
  res.json(req.user);
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;
