import { useEffect, useState } from 'react';
import { ArrowRight, LoaderCircle, LogIn, UserPlus } from 'lucide-react';
import Workspace from './App';
import { apiRequest } from './api';
import './accounts.css';

export default function AccountApp() {
  const [session, setSession] = useState(null), [checking, setChecking] = useState(true), [message, setMessage] = useState('');
  useEffect(() => {
    let mounted = true;
    apiRequest('/api/auth/me').then(result => { if (mounted) setSession(result); }).catch(error => { if (mounted && error.status !== 401) setMessage(error.message); }).finally(() => { if (mounted) setChecking(false); });
    const expired = () => { setSession(null); setMessage('Your session has expired. Sign in again to continue.'); };
    window.addEventListener('mermaid:session-expired', expired);
    return () => { mounted = false; window.removeEventListener('mermaid:session-expired',expired); };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { setSession(null); setMessage('Your session has expired. Sign in again to continue.'); }, Math.max(0,session.expiresAt*1000-Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  async function logout() {
    await apiRequest('/api/auth/logout','POST',{});
    setSession(null); setMessage('');
  }
  if (checking) return <div className="account-page"><LoaderCircle className="spin"/><span>Opening your workspace…</span></div>;
  if (session) return <Workspace key={session.user.id} user={session.user} onLogout={logout}/>;
  return <AccountForm message={message} onAuthenticated={result => { setMessage(''); setSession(result); }}/>;
}

function AccountForm({ onAuthenticated, message }) {
  const [mode,setMode] = useState('login'), [username,setUsername] = useState(''), [password,setPassword] = useState(''), [confirmation,setConfirmation] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    if (mode==='register' && password!==confirmation) { setError('Passwords do not match'); return; }
    setBusy(true);
    try { onAuthenticated(await apiRequest(`/api/auth/${mode}`,'POST',{username,password})); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <div className="account-page">
    <a className="brand" href="/" aria-label="kshyst mermaid home"><img className="brand-icon" src="/app-icon.png" alt="" width="34" height="34"/><span>kshyst<span className="brand-light">mermaid</span></span></a>
    <section className="account-card">
      <div className="eyebrow">YOUR DIAGRAM WORKSPACE</div>
      <h1>{mode==='login' ? 'Welcome back' : 'Create your account'}</h1>
      <p>{mode==='login' ? 'Sign in to your diagrams and groups.' : 'Save your ideas and collaborate with your groups.'}</p>
      <div className="account-tabs"><button className={mode==='login'?'active':''} onClick={() => { setMode('login'); setError(''); }}><LogIn size={15}/> Sign in</button><button className={mode==='register'?'active':''} onClick={() => { setMode('register'); setError(''); }}><UserPlus size={15}/> Create account</button></div>
      <form onSubmit={submit}>
        <label>Username<input aria-label="Username" autoComplete="username" required minLength={3} maxLength={32} value={username} onChange={event => setUsername(event.target.value)} placeholder="Your username"/></label>
        {mode==='register' && <small>3–32 letters, numbers, underscores or hyphens.</small>}
        <label>Password<input aria-label="Password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={8} maxLength={256} value={password} onChange={event => setPassword(event.target.value)}/></label>
        {mode==='register' && <label>Confirm password<input aria-label="Confirm password" type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label>}
        {(error||message) && <div className="account-error" role="alert">{error||message}</div>}
        <button className="button primary wide" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <ArrowRight size={16}/>} {mode==='login'?'Sign in':'Create account'}</button>
      </form>
    </section>
  </div>;
}
