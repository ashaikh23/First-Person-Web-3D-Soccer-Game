import * as THREE from 'three';

export interface ClubBannerData {
  name: string;
  slogan: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
}

export class TextureGenerator {
  /**
   * Generates a lush, natural emerald soccer pitch grass texture with alternating mowing stripes.
   */
  public static createGrassTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Rich natural grass greens
    const greens = ['#228b22', '#2e8b57', '#1e7b1e', '#239b23', '#1b6b1b', '#32a852'];

    const pixelSize = 4;
    for (let x = 0; x < size; x += pixelSize) {
      for (let y = 0; y < size; y += pixelSize) {
        ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }

    // Professional stadium alternating mowing stripes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    for (let y = 0; y < size; y += 32) {
      ctx.fillRect(0, y, size, 16);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 24);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    return texture;
  }

  /**
   * Generates an authentic, realistic match soccer ball texture (white leather with pink & gold panel styling).
   */
  public static createSoccerBallTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Premium white synthetic leather base
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, size, size);

    // Subtle leather grain texture
    for (let x = 0; x < size; x += 4) {
      for (let y = 0; y < size; y += 4) {
        if (Math.random() > 0.6) {
          ctx.fillStyle = 'rgba(226, 232, 240, 0.5)';
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // 2. Draw Classic & Modern Soccer Ball Panels
    const drawPentagon = (cx: number, cy: number, r: number, color: string, strokeCol: string) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Inner accent star/swirl (Pink Theme)
      ctx.strokeStyle = '#ff69b4';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };

    // Main pentagon panels
    const panelCenters = [
      { x: 128, y: 128 },
      { x: 384, y: 128 },
      { x: 256, y: 256 },
      { x: 128, y: 384 },
      { x: 384, y: 384 },
      { x: 0, y: 256 },
      { x: 512, y: 256 },
    ];

    for (const c of panelCenters) {
      drawPentagon(c.x, c.y, 44, '#1e293b', '#ff1493');
    }

    // 3. Dynamic Pink Aerodynamic Curved Speed Ribbons (Match Ball Styling)
    ctx.strokeStyle = '#ff1493';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 128, 80, 0, Math.PI * 1.2);
    ctx.stroke();

    ctx.strokeStyle = '#ff69b4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 384, 80, Math.PI, Math.PI * 2.2);
    ctx.stroke();

    // Seam lines connecting panels
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    for (let i = 0; i < panelCenters.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(panelCenters[i].x, panelCenters[i].y);
      ctx.lineTo(panelCenters[i + 1].x, panelCenters[i + 1].y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Generates realistic soccer jersey textures with breathable athletic mesh, collar, and team stripes.
   */
  public static createJerseyTexture(primaryColor = '#ff1493', secondaryColor = '#ffffff', trimColor = '#ffd700'): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Primary body color
    ctx.fillStyle = primaryColor;
    ctx.fillRect(0, 0, size, size);

    // 2. Athletic vertical/sash stripes
    ctx.fillStyle = secondaryColor;
    ctx.fillRect(size / 2 - 24, 0, 48, size);

    // 3. Subtle breathable fabric micro-weave texture
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1.5);
    }

    // 4. Gold collar & sleeve cuff trim
    ctx.fillStyle = trimColor;
    ctx.fillRect(0, 0, size, 12);
    ctx.fillRect(0, size - 12, size, 12);

    // 5. Team crest / star badge on chest
    ctx.fillStyle = trimColor;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', size / 2, size / 2 + 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Generates realistic soccer sock texture with ribbed cuff and stripe details.
   */
  public static createSockTexture(baseColor = '#ff1493', stripeColor = '#ffffff'): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base sock color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);

    // Ribbed knit pattern
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let x = 0; x < size; x += 4) {
      ctx.fillRect(x, 0, 1.5, size);
    }

    // Foldover top stripes
    ctx.fillStyle = stripeColor;
    ctx.fillRect(0, 10, size, 12);
    ctx.fillRect(0, 30, size, 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Generates authentic, clean real soccer club stadium banners (La Liga).
   */
  public static createClubBillboardTexture(club: ClubBannerData): THREE.CanvasTexture {
    const width = 512;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 1. Background (Club Primary Color)
    ctx.fillStyle = club.primaryColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Club Pattern (Diagonal Stripes)
    ctx.fillStyle = club.secondaryColor;
    for (let x = -height; x < width + height; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 24, 0);
      ctx.lineTo(x + 24 - 40, height);
      ctx.lineTo(x - 40, height);
      ctx.closePath();
      ctx.fill();
    }

    // 3. Dark Overlay for readability
    ctx.fillStyle = 'rgba(10, 15, 25, 0.4)';
    ctx.fillRect(8, 8, width - 16, height - 16);

    // 4. Clean stadium LED border
    ctx.strokeStyle = club.accentColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, width - 12, height - 12);

    // 5. Club Stars
    ctx.fillStyle = club.accentColor;
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('★', 24, height / 2 + 6);
    ctx.textAlign = 'right';
    ctx.fillText('★', width - 24, height / 2 + 6);

    // 6. Club Title (Clean Athletic Modern Typography)
    ctx.fillStyle = club.textColor;
    ctx.font = '900 32px "Chakra Petch", sans-serif, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 6;
    ctx.fillText(club.name, width / 2, height / 2 - 12);

    // 7. Slogan / Subtitle
    ctx.fillStyle = club.accentColor;
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    ctx.fillText(club.slogan, width / 2, height / 2 + 24);

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Generates realistic stadium crowd texture for bleachers.
   */
  public static createCrowdTexture(): THREE.CanvasTexture {
    const width = 512;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Stadium seating
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, width, height);

    // Real soccer crowd colors: pink jerseys, white shirts, blue jackets, red scarves, etc.
    const colors = [
      '#ff1493', '#ff69b4', '#ffffff', '#3b82f6', 
      '#ef4444', '#facc15', '#a855f7', '#0284c7', 
      '#f472b6', '#334155'
    ];

    const p = 4;
    for (let y = 0; y < height; y += p * 3) {
      // Stadium bench
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, y + p * 2, width, p);

      for (let x = 0; x < width; x += p * 2) {
        if (Math.random() > 0.12) {
          // Head (skin tone)
          const skins = ['#fde047', '#fbcfe8', '#fed7aa', '#fcd34d', '#f59e0b', '#d97706'];
          ctx.fillStyle = skins[Math.floor(Math.random() * skins.length)];
          ctx.fillRect(x, y, p, p);
          // Jersey / Shirt
          ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
          ctx.fillRect(x, y + p, p, p);
        }
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 2);
    texture.magFilter = THREE.NearestFilter;
    return texture;
  }

  /**
   * Generates athletic Chevron Trajectory Arrow texture for ground shot aiming.
   */
  public static createChevronArrowTexture(): THREE.CanvasTexture {
    const width = 256;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, width, height);

    const numChevrons = 5;
    const spacing = 90;
    const chevronHeight = 36;

    for (let i = 0; i < numChevrons; i++) {
      const y = height - 60 - (i * spacing);
      const alpha = 0.5 + (i / numChevrons) * 0.5;

      ctx.save();
      ctx.fillStyle = `rgba(255, 20, 147, ${alpha})`;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 5;

      ctx.beginPath();
      ctx.moveTo(width / 2, y - chevronHeight);
      ctx.lineTo(width - 32, y + chevronHeight);
      ctx.lineTo(width / 2, y + 12);
      ctx.lineTo(32, y + chevronHeight);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }
}
