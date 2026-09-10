/**
 * AvatarScene —— Three.js 渲染场景组件
 * ------------------------------------------------------------------
 * 只负责：初始化渲染器/相机/灯光/控制器、加载 GLB、创建 AvatarAdapter 与
 * AvatarController，并驱动每帧 update + render。
 * 所有"调度逻辑"都在 avatar/ 模块中，本组件不承载业务代码。
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AvatarAdapter, type AvatarCapabilities } from '../avatar/AvatarAdapter';
import { AvatarController } from '../avatar/AvatarController';

interface Props {
  onReady: (controller: AvatarController, caps: AvatarCapabilities) => void;
  onLog: (msg: string) => void;
}

const TARGET_HEIGHT = 1.7; // 模型归一化目标身高（米）

export function AvatarScene({ onReady, onLog }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onReadyRef = useRef(onReady);
  const onLogRef = useRef(onLog);
  onReadyRef.current = onReady;
  onLogRef.current = onLog;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let raf = 0;
    let controller: AvatarController | null = null;
    let modelRoot: THREE.Group | null = null;

    // ---------------------------------------------------------- 渲染器 / 相机
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101219);
    scene.fog = new THREE.Fog(0x101219, 4, 9);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      30,
    );
    camera.position.set(0, 1.44, 1.18);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.28, 0);
    controls.enablePan = false;
    controls.minDistance = 0.55;
    controls.maxDistance = 2.6;
    controls.minPolarAngle = 0.55;
    controls.maxPolarAngle = 1.42;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // ---------------------------------------------------------- 灯光
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3040, 0.95));
    const key = new THREE.DirectionalLight(0xfff2e2, 1.7);
    key.position.set(1.8, 2.8, 1.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb8ff, 0.5);
    fill.position.set(-1.8, 1.4, 1.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(-1.2, 2.6, -2.2);
    scene.add(rim);

    // ---------------------------------------------------------- 加载模型
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (!disposed) setProgress(total > 0 ? loaded / total : 0);
    };
    const loader = new GLTFLoader(manager);
    loader.load(
      'models/avatar.glb',
      (gltf) => {
        if (disposed) return;
        setProgress(1);

        // 归一化：身高 → TARGET_HEIGHT，脚底贴地，水平居中
        const group = gltf.scene;
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3());
        const min = box.min;
        if (size.y > 0.001) {
          const scale = TARGET_HEIGHT / size.y;
          group.scale.setScalar(scale);
          group.position.set(-(min.x + size.x / 2) * scale, -min.y * scale, -(min.z + size.z / 2) * scale);
        }
        modelRoot = group;
        scene.add(group);

        const adapter = new AvatarAdapter(group, gltf.animations);
        controller = new AvatarController(adapter);
        controller.setCamera(camera);
        controller.onLog = (m) => onLogRef.current(m);
        onReadyRef.current(controller, adapter.getCapabilities());
      },
      undefined,
      (err) => {
        if (disposed) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/404|Failed to fetch|load error|Unexpected token/i.test(msg)) {
          setError('未找到模型文件 public/models/avatar.glb，请先运行：npm run download-avatar');
        } else {
          setError(`模型加载失败：${msg}`);
        }
      },
    );

    // ---------------------------------------------------------- 渲染循环
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controller?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ---------------------------------------------------------- 自适应尺寸
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ---------------------------------------------------------- 清理
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (modelRoot) {
        modelRoot.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const mat = mesh.material;
            const mats = Array.isArray(mat) ? mat : [mat];
            for (const m of mats) {
              if (!m) continue;
              const mm = m as THREE.MeshStandardMaterial;
              for (const key of Object.keys(mm)) {
                const v = (mm as unknown as Record<string, unknown>)[key];
                if (v instanceof THREE.Texture) v.dispose();
              }
              m.dispose();
            }
          }
        });
        scene.remove(modelRoot);
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="avatar-scene" ref={containerRef}>
      {!error && progress < 1 && (
        <div className="scene-overlay">
          <div className="scene-progress">
            <div className="scene-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="scene-overlay-text">模型加载中… {Math.round(progress * 100)}%</div>
        </div>
      )}
      {error && (
        <div className="scene-overlay">
          <div className="scene-overlay-error">{error}</div>
        </div>
      )}
    </div>
  );
}
