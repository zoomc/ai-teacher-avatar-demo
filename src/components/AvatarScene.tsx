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
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { AvatarAdapter, type AvatarCapabilities } from '../avatar/AvatarAdapter';
import { AvatarController } from '../avatar/AvatarController';

interface Props {
  onReady: (controller: AvatarController, caps: AvatarCapabilities) => void;
  onLog: (msg: string) => void;
}

const TARGET_HEIGHT = 1.7; // 模型归一化目标身高（米）

/** 模型 URL 顺序：优先 VRM（当前人物方案），失败回退 GLB（旧测试资产） */
const MODEL_CANDIDATES = ['models/avatar.vrm', 'models/avatar.glb'];

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
    let vrmRuntime: { update(dt: number): void } | null = null;

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
    camera.position.set(0, 1.44, -1.18);

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

    // ---------------------------------------------------------- 加载模型（VRM 优先）
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      if (!disposed) setProgress(total > 0 ? loaded / total : 0);
    };

    let kind: 'vrm' | 'gltf' = 'gltf';
    (async () => {
      for (const url of MODEL_CANDIDATES) {
        if (disposed) return;
        try {
          if (url.endsWith('.vrm')) {
            const loader = new GLTFLoader(manager);
            loader.register((parser) => new VRMLoaderPlugin(parser));
            const gltf = await loader.loadAsync(url);
            if (disposed) return;
            kind = 'vrm';
            await setupRoot(gltf.scene, undefined, gltf.userData.vrm ?? null);
            return;
          }
          const gltf = await new GLTFLoader(manager).loadAsync(url);
          if (disposed) return;
          kind = 'gltf';
          await setupRoot(gltf.scene, gltf.animations, null);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/404|Failed to fetch|load error|Unexpected token/i.test(msg)) {
            continue; // 尝试下一个候选
          }
          if (disposed) return;
          setError(`模型加载失败（${url}）：${msg}`);
          return;
        }
      }
      if (!disposed) {
        setError('未找到模型文件 public/models/avatar.vrm 或 avatar.glb，请先运行：npm run download-avatar');
      }
    })();

    async function setupRoot(group: THREE.Group, animations: THREE.AnimationClip[] | undefined, vrm: unknown): Promise<void> {
      setProgress(1);

      // 归一化：身高 → TARGET_HEIGHT，脚底贴地，水平居中
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

      // VRM：normalized bones 需挂到场景树，world matrix 才会随渲染更新，
      // 驱动后由 vrm.update() 同步到 raw 蒙皮骨骼
      if (vrm && (vrm as { humanoid?: { normalizedHumanBonesRoot?: THREE.Object3D } }).humanoid) {
        const normRoot = (vrm as { humanoid: { normalizedHumanBonesRoot?: THREE.Object3D } }).humanoid
          .normalizedHumanBonesRoot;
        if (normRoot) scene.add(normRoot);
      }

      const adapter = new AvatarAdapter(group, { animations: animations ?? [], vrm });
      controller = new AvatarController(adapter, { poseSet: kind });
      controller.setCamera(camera);
      controller.onLog = (m) => onLogRef.current(m);
      if (vrm && typeof (vrm as { update?: (d: number) => void }).update === 'function') {
        vrmRuntime = vrm as { update(dt: number): void };
        // VRM 原生 lookAt：让眼球跟随相机（比骨骼驱动更标准，含 rangeMap）
        const vrmAny = vrm as { lookAt?: { target?: THREE.Object3D | null; autoUpdate?: boolean } };
        if (vrmAny.lookAt) {
          vrmAny.lookAt.autoUpdate = true;
          vrmAny.lookAt.target = camera;
        }
        // 关键：three-vrm 的 humanoid.update() 只把 normalized quaternion 复制到原始骨骼，
        // 若原始骨骼 matrixAutoUpdate 被关闭，局部 matrix 不跟随 quaternion，
        // 蒙皮 boneMatrices 将永远停留在 rest 姿态（骨骼数值对、渲染不动）。
        (vrm as { scene: THREE.Object3D }).scene.traverse((o: THREE.Object3D) => {
          if ((o as THREE.Bone).isBone) (o as THREE.Bone).matrixAutoUpdate = true;
        });
      }
      // eslint-disable-next-line no-console
      console.log('[avatar] bones:', adapter.foundBoneParts.join(','));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__avatarDebug = { adapter, controller, scene, vrm, THREE };
      onReadyRef.current(controller, adapter.getCapabilities());
    }

    // ---------------------------------------------------------- 渲染循环
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controller?.update(dt);
      controller?.adapter.flushMorphs();
      vrmRuntime?.update(dt);
      // 强制骨骼矩阵落盘：VRM0 骨骼树的 matrixAutoUpdate 可能不生效，
      // 不 force 时蒙皮 boneMatrices 会停留在加载时的 rest 姿态（骨骼值对、渲染不动）。
      scene.updateMatrixWorld(true);
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
