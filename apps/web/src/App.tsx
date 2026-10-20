import { useEffect, useState, type FormEvent } from 'react';
import AdminPanel from './AdminPanel';
import { ArrowRight, CalendarDays, ClipboardList, LockKeyhole, LogOut, PackageCheck, ShieldCheck, ShoppingBasket, Smartphone, UserRound } from 'lucide-react';

type Role = 'admin' | 'buyer' | 'customer';
type User = { id: number; name: string; email: string; role: Role };
type Overview = { role: Role; title: string; description: string };
const API_URL = import.meta.env.VITE_API_URL ?? '';
const roles: Record<Role, { label: string; caption: string; cards: { title: string; subtitle: string; icon: typeof ClipboardList }[] }> = {
  admin: {
    label: 'Administrador',
    caption: 'Controla las jornadas, los pedidos y la operación desde un solo lugar.',
    cards: [
      { title: 'Jornadas de compra', subtitle: 'Próxima fase · Calendario y asignaciones', icon: CalendarDays },
      { title: 'Pedidos', subtitle: 'Próxima fase · Captura y revisión manual', icon: ClipboardList },
      { title: 'Clientes', subtitle: 'Próxima fase · Registro y seguimiento', icon: UserRound },
    ],
  },
  buyer: {
    label: 'Comprador',
    caption: 'Lleva tu lista de compra y gestiona cada artículo desde el celular.',
    cards: [
      { title: 'Mis jornadas', subtitle: 'Disponible en la Fase 2', icon: CalendarDays },
      { title: 'Lista de productos', subtitle: 'Disponible en la Fase 2', icon: ShoppingBasket },
      { title: 'Artículos confirmados', subtitle: 'Disponible en la Fase 2', icon: PackageCheck },
    ],
  },
  customer: {
    label: 'Cliente',
    caption: 'En próximas fases podrás consultar tus pedidos. WhatsApp será el canal principal.',
    cards: [
      { title: 'Mis encargos', subtitle: 'Portal de cliente · Próxima etapa', icon: ClipboardList },
      { title: 'Próximas compras', subtitle: 'Portal de cliente · Próxima etapa', icon: CalendarDays },
      { title: 'Consultas', subtitle: 'Portal de cliente · Próxima etapa', icon: Smartphone },
    ],
  },
};

async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudo conectar con el servidor.');
  return data as T;
}

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email: email.trim(), password }),
      });
      onLogin(result.token, result.user);
    } catch (err) { setError(err instanceof Error ? err.message : 'Error al iniciar sesión'); }
    finally { setBusy(false); }
  }
  return (
    <main className="login-shell">
      <section className="hero-side">
        <div className="brand light"><span className="brand-mark"><ShoppingBasket size={23}/></span><span>delivery<span className="brand-dot">.</span></span></div>
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> SISTEMA DE COMPRAS POR ENCARGO</div>
          <h1>Organiza cada compra. <em>Sin complicaciones.</em></h1>
          <p>Un lugar para coordinar pedidos de Costco y Sam's Club, tu equipo y tus clientes.</p>
          <div className="hero-features">
            <div><CalendarDays size={20} /> Jornadas organizadas</div>
            <div><ClipboardList size={20} /> Pedidos centralizados</div>
            <div><Smartphone size={20} /> Pensado para tu celular</div>
          </div>
        </div>
        <div className="hero-footer">Versión inicial · Fase 0</div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <div className="icon-box"><LockKeyhole size={23} /></div>
          <span className="section-kicker">BIENVENIDO DE NUEVO</span>
          <h2>Iniciar sesión</h2>
          <p className="muted">Accede con las credenciales configuradas por el administrador.</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" placeholder="Tu contraseña" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary-btn" type="submit" disabled={busy}>{busy ? 'Ingresando...' : 'Entrar al sistema'} <ArrowRight size={18}/></button>
          </form>
          <p className="login-note"><ShieldCheck size={16}/> Acceso privado para usuarios autorizados</p>
        </div>
      </section>
    </main>
  );
}

function Dashboard({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const settings = roles[user.role];
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api<Overview>('/api/' + user.role + '/overview', {}, token)
      .then(data => { if (alive) setOverview(data); })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : 'Error'); });
    return () => { alive = false; };
  }, [user.role, token]);
  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><ShoppingBasket size={20}/></span> delivery<span className="brand-dot">.</span></div>
        <div className="topbar-right"><span className="role-tag">{settings.label}</span><button className="logout-btn" onClick={onLogout}><LogOut size={17}/> <span>Salir</span></button></div>
      </header>
      <div className="dashboard-content">
        <div className="breadcrumb">Panel principal <span>/</span> {settings.label}</div>
        <div className="welcome"><span className="section-kicker">TU ESPACIO DE TRABAJO</span><h1>Hola, {user.name} <span className="wave">👋</span></h1><p>{settings.caption}</p></div>
        <div className="phase-banner"><span className="phase-icon"><ShieldCheck size={21}/></span><div><strong>La estructura ya está lista</strong><p>Fase 0 · Autenticación y acceso por roles habilitados. Las operaciones se incorporan por etapas.</p></div><span className="phase-pill">EN DESARROLLO</span></div>
        <div className="section-heading"><h2>Tu panel</h2><span>Próximas funcionalidades</span></div>
        <div className="features-grid">
          {settings.cards.map(({title,subtitle,icon:Icon}) => (
            <article className="feature-card" key={title}><div className="feature-icon"><Icon size={23}/></div><h3>{title}</h3><p>{subtitle}</p><span className="soon">Próximamente</span></article>
          ))}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {overview && <p className="api-state"><span className="live-dot"/> Conectado al servidor · {overview.description}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem('delivery.token') || '');
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    if (!token) { setChecking(false); return; }
    api<{ user: User }>('/api/auth/me', {}, token).then(result => { if (alive) setUser(result.user); })
      .catch(() => { if (alive) { sessionStorage.removeItem('delivery.token'); setToken(''); setUser(null); } })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [token]);
  function login(nextToken: string, nextUser: User) { sessionStorage.setItem('delivery.token', nextToken); setToken(nextToken); setUser(nextUser); setChecking(false); }
  function logout() { sessionStorage.removeItem('delivery.token'); setToken(''); setUser(null); }
  if (checking) return <div className="loading">Conectando con Delivery...</div>;
  return user && token ? (user.role === 'admin' ? <AdminPanel user={user} token={token} onLogout={logout}/> : <Dashboard user={user} token={token} onLogout={logout}/>) : <Login onLogin={login}/>;
}
