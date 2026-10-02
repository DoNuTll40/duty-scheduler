import './globals.css';

export const metadata = { title: 'ระบบจัดตารางเวร', description: 'Dynamic duty scheduling', manifest: undefined };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#4f46e5' };

const themeScript = `try{var t=localStorage.getItem('ds-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
