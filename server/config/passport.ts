import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from '../database/db.js';
import { User } from '../types.js';

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const profilePicture = profile.photos?.[0]?.value;

        if (!email) {
          return done(new Error('No email found in Google profile'), undefined);
        }

        // Check if user exists
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [
          email,
        ]);

        let user: User;

        if (result.rows.length === 0) {
          // User doesn't exist - check if email is allowed
          // For now, all authenticated Google users can create accounts
          // In production, you would check against an allowlist here
          
          const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',').map(d => d.trim()) || [];
          
          if (allowedDomains.length > 0) {
            const emailDomain = email.split('@')[1];
            if (!allowedDomains.includes(emailDomain)) {
              return done(new Error('Email domain not authorized'), undefined);
            }
          }

          // Create new user with 'User' role
          const insertResult = await pool.query(
            `INSERT INTO users (email, name, profile_picture, role, annual_leave_balance)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [email, name, profilePicture, 'User', 15.0]
          );
          user = insertResult.rows[0];
        } else {
          user = result.rows[0];

          // Check if user is active
          if (!user.is_active) {
            return done(new Error('User account is inactive'), undefined);
          }

          // Update user info (name and profile picture might have changed)
          await pool.query(
            'UPDATE users SET name = $1, profile_picture = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [name, profilePicture, user.id]
          );

          // Fetch updated user
          result = await pool.query('SELECT * FROM users WHERE id = $1', [
            user.id,
          ]);
          user = result.rows[0];
        }

        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error as Error, undefined);
      }
    }
  )
);

// Serialize user to session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: number, done) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    if (result.rows.length === 0) {
      return done(new Error('User not found'), null);
    }
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
