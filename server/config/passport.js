import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.NODE_ENV === 'production'
        ? 'https://bluc-payed.vercel.app/api/auth/google/callback'
        : 'http://localhost:3000/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          return done(null, user);
        }
        
        // Create new user if doesn't exist
        user = new User({
          email: profile.emails[0].value,
          fullName: profile.displayName,
          googleId: profile.id,
          isProfileComplete: false
        });
        
        await user.save();
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

export default passport