import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, Key, Sparkles } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { apiBaseUrl } from '../config';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const accounts = JSON.parse(localStorage.getItem('livecollab_accounts') || '[]');

    if (isSignUp) {
      const existing = accounts.find(acc => acc.email.toLowerCase() === email.trim().toLowerCase());
      if (existing) {
        alert('An account with this email already exists. Please sign in.');
        setIsSignUp(false);
        return;
      }

      const user = {
        name: name.trim() || email.split('@')[0],
        email: email.trim(),
        picture: null,
        local: true
      };
      const nextAccounts = [...accounts, { ...user, password }];
      localStorage.setItem('livecollab_accounts', JSON.stringify(nextAccounts));
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/dashboard');
      return;
    }

    const account = accounts.find(
      acc => acc.email.toLowerCase() === email.trim().toLowerCase() && acc.password === password
    );
    if (!account) {
      alert('Invalid email or password. If you are new, click Create one.');
      return;
    }

    localStorage.setItem('user', JSON.stringify({
      name: account.name,
      email: account.email,
      picture: account.picture || null,
      local: true
    }));
    navigate('/dashboard');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code) {
      fetch(`${apiBaseUrl}/api/room/${code}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error('Room not found');
          }
          navigate(`/room/${code}`);
        })
        .catch(() => {
          alert('Room not found. Please check the code and try again.');
        });
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      const data = await res.json();
      if (data.success) {
        // Save user detais to localStorage to persist session
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      } else {
        const detailText = data.details ? ` (${data.details})` : '';
        alert(`Authentication failed: ${data.error || 'Unknown error'}${detailText}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error reaching authentication server.");
    }
  };

  const handleGoogleError = () => {
    console.error('Login Failed');
  };

  return (
    <div className="login-split-container">
      {/* Left side: Premium Hero Banner */}
      <div className="login-hero-side">
        <div className="hero-overlay"></div>
        <svg className="hero-bg-image" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
          <defs>
            <radialGradient id="glow-primary" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="glow-secondary" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
            </radialGradient>
            <pattern id="hero-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.08)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="var(--panel-bg)" />
          {/* Animated Glowing Orbs */}
          <circle cx="20%" cy="30%" r="50%" fill="url(#glow-primary)" />
          <circle cx="90%" cy="80%" r="60%" fill="url(#glow-secondary)" />
          
          <rect width="100%" height="100%" fill="url(#hero-dots)" />
          
          {/* Abstract Vector Doodles */}
          <path d="M-100 250 C 200 100, 300 500, 800 200" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
          <path d="M0 700 C 400 900, 500 500, 1000 800" fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="12,12" strokeOpacity="0.5" />
          
          {/* Floating UI Vectors */}
          <g transform="translate(150, 150) rotate(15)">
            <rect width="64" height="64" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <circle cx="32" cy="32" r="12" fill="rgba(255,255,255,0.1)" />
          </g>
          
          <g transform="translate(450, 650) rotate(-20)">
            <rect width="96" height="48" rx="24" fill="rgba(255,255,255,0.02)" stroke="#818cf8" strokeWidth="1.5" strokeOpacity="0.4" />
          </g>

          <circle cx="80%" cy="20%" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
          <polygon points="600,100 620,140 580,140" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        </svg>
        
        <div className="hero-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', padding: '0 2.5rem' }}>
          <div className="hero-logo-wrap">
            <img src="/logo.png" alt="LiveCollab" />
          </div>
          <h1 className="hero-headline">Create, build, and innovate <br/><span className="text-gradient">in real-time.</span></h1>
          <p className="hero-subtitle" style={{ margin: '0 auto 2rem' }}>The AI-powered workspace combining video, robust whiteboard tools, and real-time multiplayer cursors seamlessly.</p>
          
          <div className="glass-card hero-feature-badge bounce-hover" style={{ margin: '0 auto' }}>
            <Sparkles size={20} className="text-gradient" />
            <span>AI generates meeting summaries automatically</span>
          </div>
        </div>
      </div>

      {/* Right side: Modern Auth Form */}
      <div className="login-form-side">
        <div className="login-form-wrapper">
          <div className="login-header-mobile">
            <img src="/logo.png" alt="LiveCollab AI" style={{ height: '70px', objectFit: 'contain' }} />
          </div>
          
          <div className="form-titles">
            <h2>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-secondary">
              {isSignUp ? 'Create your account to get started.' : 'Please enter your details to sign in.'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            {isSignUp && (
              <div className="form-group floating-input">
                <div className="input-icon-wrapper">
                  <Mail className="input-icon text-secondary" size={18} />
                  <input
                    type="text"
                    className="input-glass input-with-icon"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="form-group floating-input">
              <div className="input-icon-wrapper">
                <Mail className="input-icon text-secondary" size={18} />
                <input
                  type="email"
                  id="email"
                  className="input-glass input-with-icon"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="form-group floating-input">
              <div className="input-icon-wrapper">
                <Lock className="input-icon text-secondary" size={18} />
                <input
                  type="password"
                  id="pass"
                  className="input-glass input-with-icon"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-options" style={{ visibility: isSignUp ? 'hidden' : 'visible' }}>
              <label className="checkbox-wrap">
                <input type="checkbox" />
                <span className="text-secondary text-sm">Remember me</span>
              </label>
              <a href="#" className="text-gradient text-sm font-medium">Forgot Password?</a>
            </div>

            <button type="submit" className="btn-primary auth-submit flex-center">
              {isSignUp ? 'Create Account' : 'Sign In'} <LogIn size={18} style={{marginLeft: '0.5rem'}} />
            </button>
          </form>

          <div className="divider">OR</div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="filled_black"
              shape="pill"
              size="large"
            />
          </div>

          <div className="join-room-card glass-panel">
            <h4 className="text-secondary text-sm font-medium mb-3">HAVE A ROOM CODE?</h4>
            <form onSubmit={handleJoinRoom} className="join-form">
              <div className="input-icon-wrapper flex-1">
                <Key className="input-icon text-secondary" size={18} />
                <input 
                  type="text" 
                  className="input-glass input-with-icon" 
                  placeholder="Enter Code" 
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  style={{ borderRadius: '12px 0 0 12px' }}
                  required 
                />
              </div>
              <button type="submit" className="btn-secondary join-btn">
                Join
              </button>
            </form>
          </div>

          <p className="signup-link text-center text-secondary text-sm">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              className="login-switch-btn font-medium"
              onClick={() => setIsSignUp(prev => !prev)}
            >
              {isSignUp ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
