import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 运行时错误可见化：便于 Demo 阶段排查（同时显示在页面左上角）
window.addEventListener('error', (e) => {
  console.error('[runtime error]', e.message);
  let el = document.getElementById('runtime-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'runtime-error';
    el.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:999;max-width:60vw;background:#24161b;color:#ffb4c0;' +
      'border:1px solid #5a2f3a;border-radius:6px;padding:6px 10px;font:11px/1.5 monospace;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent = `[runtime error] ${e.message}`;
});

// 说明：Three.js 场景涉及手动资源生命周期管理，
// 这里不启用 StrictMode 以避免开发模式下 effect 双执行导致渲染器/加载器重复创建。
createRoot(document.getElementById('root')!).render(<App />);
