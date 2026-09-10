import { useCallback, useEffect, useState } from 'react';
import { AvatarScene } from './components/AvatarScene';
import { ControlPanel } from './components/ControlPanel';
import type { AvatarController } from './avatar/AvatarController';
import type { AvatarCapabilities } from './avatar/AvatarAdapter';

function StatusBar({ controller }: { controller: AvatarController }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      setTick((t) => t + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="status-bar">{controller.debugString()}</div>;
}

export default function App() {
  const [controller, setController] = useState<AvatarController | null>(null);
  const [caps, setCaps] = useState<AvatarCapabilities | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const handleReady = useCallback((c: AvatarController, cap: AvatarCapabilities) => {
    setController(c);
    setCaps(cap);
    // 暴露到 window，便于控制台/自动化验证控制链路
    (window as unknown as { avatar?: AvatarController }).avatar = c;
  }, []);

  const handleLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-199), msg]);
  }, []);

  return (
    <div className="app">
      <div className="stage">
        <AvatarScene onReady={handleReady} onLog={handleLog} />
        {controller && <StatusBar controller={controller} />}
      </div>
      <ControlPanel controller={controller} caps={caps} logs={logs} />
    </div>
  );
}
