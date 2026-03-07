'use client';

import React, { useState, useEffect } from 'react';
import { Heartbeat, Lock, Envelope } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkExistingAuth() {
      try {
        const token = api.getToken();
        if (!token) {
          setCheckingAuth(false);
          return;
        }
        const userData = await api.getMe();
        const latestSurvey = await api.getLatestSurvey().catch(() => null);
        if (!latestSurvey) {
          router.replace('/survey');
        } else if (!userData.permissionsConfigured) {
          router.replace('/setup-permissions');
        } else {
          router.replace('/dashboard/analysis');
        }
      } catch {
        api.clearToken();
        setCheckingAuth(false);
      }
    }
    checkExistingAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-cover bg-center relative"
        style={{
          backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
        }}
      >
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
        <div className="relative z-10 text-center space-y-4">
          <Heartbeat size={48} className="text-blue-500 animate-pulse mx-auto" />
          <div className="text-slate-500 font-mono text-sm animate-pulse">VERIFYING SESSION...</div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.login(email, password);
      const latestSurvey = await api.getLatestSurvey().catch(() => null);
      if (!latestSurvey) {
        router.push('/survey');
      } else if (!response.user.permissionsConfigured) {
        router.push('/setup-permissions');
      } else {
        router.push('/dashboard/analysis');
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center relative px-4 py-6"
      style={{
        backgroundImage: 'linear-gradient(to bottom right, #0f172a, #1e293b)',
      }}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div className="scanlines hidden md:block" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-slate-900/90 border border-slate-700 rounded-sm p-5 sm:p-8 backdrop-blur-md animate-scale-in">
          <div className="flex flex-col items-center mb-8">
            <div className="relative mb-4">
              <Heartbeat size={48} weight="duotone" className="text-blue-400" />
              <div className="absolute -inset-2 bg-blue-500/20 rounded-full animate-pulse-ring" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-chivo font-bold uppercase tracking-wider text-center">
              SmartPulse
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-2 text-center">
              Smartphone Addiction Prediction System
            </p>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 rounded-sm p-3 mb-4 text-sm text-red-400 font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                Email
              </label>
              <div className="relative">
                <Envelope className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-sm placeholder:text-slate-600 font-mono text-sm pl-10 pr-3 py-2.5 border outline-none"
                  placeholder="user@email.com"
                  data-testid="email-input"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-xs uppercase tracking-wider mb-2 font-mono">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-sm placeholder:text-slate-600 font-mono text-sm pl-10 pr-3 py-2.5 border outline-none"
                  placeholder="••••••••"
                  data-testid="password-input"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-sm font-medium tracking-wide uppercase text-sm px-4 py-3 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="login-submit-btn"
            >
              {loading ? 'Authenticating...' : 'Access System'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-500 text-sm">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => router.push('/register')}
                className="text-blue-400 hover:text-blue-300 font-medium uppercase text-xs tracking-wider transition-colors"
              >
                Create Account
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
