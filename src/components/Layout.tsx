import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

const NAV = [
  { to: '/', label: '首页' },
  { to: '/topics', label: '考点' },
  { to: '/library', label: '题库' },
  { to: '/recite', label: '背题' },
  { to: '/import', label: '导入' },
];

function getTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('killquestion.theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Layout() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const location = useLocation();

  useEffect(() => {
    const t = getTheme();
    setTheme(t);
    document.documentElement.dataset.theme = t;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('killquestion.theme', next);
  };

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.mark}>KQ</span>
            <span className={styles.brandText}>
              <strong>KillQuestion</strong>
              <small>本地优先 · 题库刷题</small>
            </span>
          </Link>
          <nav className={styles.nav}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" className={styles.themeBtn} onClick={toggleTheme} aria-label="切换主题">
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <span>数据只存在你的浏览器里 · 断网也能刷</span>
      </footer>
    </div>
  );
}
