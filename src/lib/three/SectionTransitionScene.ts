import * as THREE from 'three';

export interface SectionMeta {
  id: string;
  num: string;
  title: string;
}

export const SECTIONS: SectionMeta[] = [
  { id: 'top', num: '00', title: 'Intro' },
  { id: 'about', num: '01', title: 'About' },
  { id: 'experience', num: '02', title: 'Experience' },
  { id: 'education', num: '03', title: 'Education' },
  { id: 'work', num: '04', title: 'Selected Work' },
  { id: 'contact', num: '05', title: 'Contact' },
];

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
uniform float uProgress;
uniform float uDirection;
uniform vec2 uResolution;
uniform vec3 uColorPrimary;
uniform vec3 uColorSecondary;
uniform float uIsDark;

varying vec2 vUv;

void main() {
  if (uProgress >= 1.0 || uProgress <= 0.0) {
    discard;
  }

  // Wave position travelling across the screen (0.0 to 1.0)
  float waveCenter = uDirection > 0.0 
    ? (uProgress * 1.5 - 0.25)
    : ((1.0 - uProgress) * 1.5 - 0.25);

  // Organic distortion on the leading edge
  float waveDistortion = sin(vUv.x * 14.0 + uTime * 6.0) * 0.035
                       + cos(vUv.x * 28.0 - uTime * 3.0) * 0.015;

  float dist = abs(vUv.y - waveCenter + waveDistortion);

  // Sharp leading laser hairline
  float laser = smoothstep(0.012, 0.0, dist);

  // Soft luminous aura
  float aura = smoothstep(0.22, 0.0, dist);

  // Edge vignette: ensure the center text area has low opacity so readability is 100% pristine
  float centerDist = abs(vUv.x - 0.5) * 2.0;
  float edgeEnhance = 0.25 + smoothstep(0.2, 0.9, centerDist) * 0.75;

  // Master alpha curve: bell curve that peaks during the transition midpoint
  float transitionEnvelope = sin(uProgress * 3.14159);

  float alpha = (laser * 0.75 + aura * 0.35) * edgeEnhance * transitionEnvelope;

  // Color gradient
  vec3 col = mix(uColorPrimary, uColorSecondary, sin(vUv.x * 3.14159 + uTime));

  gl_FragColor = vec4(col, alpha);
}
`;

export class SectionTransitionScene {
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;

  // Timing
  private startTime = performance.now();
  private reqId: number | null = null;

  // Transition Wave State
  private transitionProgress = 1.0; // 1.0 = idle
  private transitionDirection = 1.0; // 1.0 = down, -1.0 = up
  private transitionDuration = 850; // ms
  private transitionStartTime = 0;
  private activeSectionIndex = 0;

  // Material & Mesh
  private transitionMaterial!: THREE.ShaderMaterial;
  private transitionMesh!: THREE.Mesh;

  // Transition Spark Particles
  private particlesMesh!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;
  private particleAlphas!: Float32Array;
  private particleCount = 240;

  // Theme
  private isDarkMode = false;
  private themeObserver: MutationObserver | null = null;

  // Listeners
  private onResizeBound = this.onResize.bind(this);
  private onScrollBound = this.onScroll.bind(this);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.init();
  }

  private init() {
    this.isDarkMode = document.documentElement.classList.contains('dark');

    // 1. Scene & Orthographic Camera (ideal for fullscreen screen-space effects)
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Fullscreen Transition Wave Quad
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.transitionMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 1.0 },
        uDirection: { value: 1.0 },
        uResolution: {
          value: new THREE.Vector2(window.innerWidth, window.innerHeight),
        },
        uColorPrimary: {
          value: this.isDarkMode
            ? new THREE.Color(0xff5522)
            : new THREE.Color(0xc4431e),
        },
        uColorSecondary: {
          value: this.isDarkMode
            ? new THREE.Color(0x38bdf8)
            : new THREE.Color(0x64748b),
        },
        uIsDark: { value: this.isDarkMode ? 1.0 : 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.transitionMesh = new THREE.Mesh(quadGeo, this.transitionMaterial);
    this.scene.add(this.transitionMesh);

    // 3. Transition Micro-Particle Sparks
    this.buildParticleSparks();

    // 4. Listeners
    window.addEventListener('resize', this.onResizeBound, { passive: true });
    window.addEventListener('scroll', this.onScrollBound, { passive: true });

    // Custom event to trigger section transition programmatically (e.g. from nav clicks)
    window.addEventListener('trigger-section-transition', ((e: CustomEvent) => {
      const { toIndex, direction } = e.detail || {};
      if (typeof toIndex === 'number') {
        this.startTransition(toIndex, direction || 'down');
      }
    }) as EventListener);

    // Theme observer
    this.themeObserver = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== this.isDarkMode) {
        this.isDarkMode = dark;
        this.updateThemeVisuals();
      }
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    this.onScroll();
    this.animate();
  }

  // ── Micro-Particle Sparks ────────────────────────────────
  private buildParticleSparks() {
    const geo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleVelocities = new Float32Array(this.particleCount * 3);
    this.particleAlphas = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i, false);
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    // Procedural soft point texture
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, 'rgba(255, 120, 60, 0.8)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      map: texture,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlesMesh = new THREE.Points(geo, mat);
    this.scene.add(this.particlesMesh);
  }

  private resetParticle(i: number, active = false) {
    this.particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
    this.particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
    this.particlePositions[i * 3 + 2] = 0;

    this.particleVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.008;
    this.particleVelocities[i * 3 + 1] = active
      ? -this.transitionDirection * (0.015 + Math.random() * 0.02)
      : 0;
    this.particleVelocities[i * 3 + 2] = 0;

    this.particleAlphas[i] = active ? 0.8 + Math.random() * 0.2 : 0;
  }

  // ── Trigger Transition Between Sections ─────────────────
  public startTransition(targetIdx: number, direction: 'down' | 'up' = 'down') {
    if (targetIdx === this.activeSectionIndex && this.transitionProgress < 1.0) {
      return;
    }

    this.activeSectionIndex = targetIdx;
    this.transitionDirection = direction === 'down' ? 1.0 : -1.0;
    this.transitionProgress = 0.0;
    this.transitionStartTime = performance.now();

    // Spawn burst of spark particles along the leading edge
    for (let i = 0; i < this.particleCount; i++) {
      this.resetParticle(i, true);
    }

    // Notify UI HUD
    const meta = SECTIONS[targetIdx] || SECTIONS[0];
    window.dispatchEvent(
      new CustomEvent('section-switch-active', {
        detail: {
          section: meta,
          index: targetIdx,
          direction,
        },
      })
    );
  }

  // ── Scroll Listener for Automatic Section Switch Detection ──
  private onScroll() {
    const sectionElements = SECTIONS.map((s) => document.getElementById(s.id));
    const viewportHeight = window.innerHeight;

    let newActiveIdx = 0;
    for (let i = 0; i < sectionElements.length; i++) {
      const el = sectionElements[i];
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.top <= viewportHeight * 0.45) {
        newActiveIdx = i;
      }
    }

    if (newActiveIdx !== this.activeSectionIndex) {
      const dir = newActiveIdx > this.activeSectionIndex ? 'down' : 'up';
      this.startTransition(newActiveIdx, dir);
    }
  }

  // ── Theme Switch Updates ────────────────────────────────
  private updateThemeVisuals() {
    const isDark = this.isDarkMode;
    if (this.transitionMaterial) {
      this.transitionMaterial.uniforms.uColorPrimary.value.set(
        isDark ? 0xff5522 : 0xc4431e
      );
      this.transitionMaterial.uniforms.uColorSecondary.value.set(
        isDark ? 0x38bdf8 : 0x64748b
      );
      this.transitionMaterial.uniforms.uIsDark.value = isDark ? 1.0 : 0.0;
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if (this.transitionMaterial) {
      this.transitionMaterial.uniforms.uResolution.value.set(w, h);
    }
  }

  // ── Render Loop ─────────────────────────────────────────
  private animate() {
    this.reqId = requestAnimationFrame(this.animate.bind(this));

    const now = performance.now();
    const time = (now - this.startTime) / 1000;

    // Update transition progress
    if (this.transitionProgress < 1.0) {
      const elapsed = now - this.transitionStartTime;
      const t = Math.min(1.0, elapsed / this.transitionDuration);

      // Smooth easeInOutCubic curve
      this.transitionProgress =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.transitionMaterial.uniforms.uProgress.value = this.transitionProgress;
      this.transitionMaterial.uniforms.uDirection.value = this.transitionDirection;

      // Update spark particles
      const posAttr = this.particlesMesh.geometry.attributes.position;
      const positions = posAttr.array as Float32Array;

      for (let i = 0; i < this.particleCount; i++) {
        positions[i * 3 + 0] += this.particleVelocities[i * 3 + 0];
        positions[i * 3 + 1] += this.particleVelocities[i * 3 + 1];

        // Dampen velocity
        this.particleVelocities[i * 3 + 1] *= 0.95;
      }
      posAttr.needsUpdate = true;

      // Particle opacity follows transition envelope
      const envelope = Math.sin(this.transitionProgress * Math.PI);
      (this.particlesMesh.material as THREE.PointsMaterial).opacity =
        envelope * (this.isDarkMode ? 0.75 : 0.4);
    } else {
      this.transitionMaterial.uniforms.uProgress.value = 1.0;
      (this.particlesMesh.material as THREE.PointsMaterial).opacity = 0.0;
    }

    this.transitionMaterial.uniforms.uTime.value = time;

    this.renderer.render(this.scene, this.camera);
  }

  public dispose() {
    if (this.reqId !== null) cancelAnimationFrame(this.reqId);
    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('scroll', this.onScrollBound);
    if (this.themeObserver) this.themeObserver.disconnect();
    this.renderer.dispose();
  }
}
