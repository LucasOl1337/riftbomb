var A=`attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`,L=`#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_scale;
uniform float u_warp;
uniform float u_sym;
uniform float u_pixel;
uniform float u_dots;
uniform float u_dot;
uniform float u_dither;
uniform float u_grain;
uniform int   u_pal;
uniform vec3  u_c0;
uniform vec3  u_c1;
uniform vec3  u_c2;
uniform vec3  u_c3;
uniform sampler2D u_tex;
uniform float u_hasTex;
uniform float u_texAspect;
uniform float u_liq;
uniform float u_mix;
uniform float u_split;
uniform int   u_field;
uniform int   u_field2;
uniform int   u_blend;
uniform float u_layerMix;
uniform int   u_screen;
uniform int   u_material;
uniform sampler2D u_glyph;
uniform sampler2D u_mask;
uniform float u_hasMask;
uniform vec3  u_maskBg;
uniform vec3  u_maskBg2;
uniform float u_maskGrad;
uniform vec2  u_pan;
uniform vec2  u_mouse;
uniform float u_mouseAmt;
uniform int   u_mouseMode;
uniform float u_rec;

float hash(vec2 p){
  /* precision-safe: no huge sin args, stable on mobile GPUs + long sessions */
  p = fract(p * 0.3183099 + fract(u_seed * 0.1031) + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.9);
    a *= 0.5;
  }
  return v;
}


vec2 hash22(vec2 p){
  return vec2(hash(p), hash(p + vec2(37.2, 17.3)));
}

/* hex cell center for the point p (in cell units) */
vec2 hexCenter(vec2 p){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return p - gv;
}

/* field B: curl of a noise potential -> divergence-free flow (fluid swirl).
   drift is the same bounded (d1,d2) the noise field uses, applied to the
   potential domain so the swirl morphs at the same visible rate. */
vec2 fgrad(vec2 p, vec2 off){
  float e = 0.06;
  float gx = fbm(p + vec2(e, 0.0) + off) - fbm(p - vec2(e, 0.0) + off);
  float gy = fbm(p + vec2(0.0, e) + off) - fbm(p - vec2(0.0, e) + off);
  return vec2(gx, gy) / (2.0 * e);
}
/* spread: push a mid-clustered field value out toward 0 and 1 around its midpoint, so a
   custom palette uses its FULL range. fbm/sum fields pile up near 0.5 and otherwise hide
   the end stops; geometric fields already span the range and are left alone. */
float spreadF(float v, float g){ return clamp((v - 0.5) * g + 0.5, 0.0, 1.0); }
float fieldFlow(vec2 p, float t){
  /* curl-noise flow that reorganizes in place. Two spatially-varying warps,
     modulated by different time frequencies, reshape the flow potential locally
     (never a uniform translation), and there is no global drift on the output \u2014
     so the streams keep reforming instead of the whole field panning. */
  float amt = 0.6 + u_warp * 0.25;
  vec2 wa = vec2(fbm(p * 0.6 + 11.0), fbm(p * 0.6 + 27.0)) - 0.5;
  vec2 wb = vec2(fbm(p * 0.9 + 41.0), fbm(p * 0.9 + 63.0)) - 0.5;
  vec2 sp = p + wa * (1.1 * sin(t * 0.13)) + wb * (1.0 * cos(t * 0.091));
  vec2 g = fgrad(sp, vec2(0.0));
  vec2 curl = vec2(g.y, -g.x);
  return spreadF(fbm(p + curl * amt), 2.0);
}

/* field C: Worley/Voronoi cellular noise (warp blends cells <-> edges) */
float fieldCellular(vec2 p, float t){
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 9.0; float f2 = 9.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g);
      o = 0.5 + 0.5 * sin(t * 0.5 + 6.2831 * o);
      vec2 d = g + o - fp;
      float dd = dot(d, d);
      if (dd < f1){ f2 = f1; f1 = dd; }
      else if (dd < f2){ f2 = dd; }
    }
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
  float cells = 1.0 - f1;
  float edges = f2 - f1;
  return mix(cells, edges, clamp(u_warp / 9.0, 0.0, 1.0));
}
/* field D: gyroid \u2014 a 3D gyroid sliced through time; interwoven organic bands.
   warp adds a self-fold so the weave thickens/curls. */
float fieldGyroid(vec2 p, float t){
  vec3 q = vec3(p * 1.4, t * 0.3);
  float g = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x);
  g += (0.15 + u_warp * 0.12) * sin(2.0 * g + length(p));
  return 0.5 + 0.5 * sin(g * 1.6);
}

/* field E: truchet \u2014 random corner arcs per cell -> woven maze / circuit lines.
   bands follow the 0.5-radius arcs; warp packs them tighter. */
float truchetCell(vec2 p, float h){
  vec2 fp = fract(p);
  if (h < 0.5){ fp.x = 1.0 - fp.x; }
  float d = min(length(fp), length(fp - 1.0));
  d = abs(d - 0.5);
  float bands = 4.0 + u_warp * 2.5;
  return 0.5 + 0.5 * cos(d * bands * 6.2831853 - u_time * 1.5);
}
float fieldTruchet(vec2 p, float t){ return truchetCell(p, hash(floor(p))); }

/* field F: interference \u2014 overlapping ripple sources -> moire rings.
   warp raises the ripple frequency (denser moire). */
float fieldInterf(vec2 p, float t){
  float v = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 c = 1.2 * vec2(sin(t * 0.2 + fi * 1.7), cos(t * 0.17 + fi * 2.3));
    float freq = 5.0 + u_warp * 2.0 + fi * 1.6;
    v += sin(length(p - c) * freq - t * 1.2 + fi);
  }
  return 0.5 + 0.5 * (v / 4.0);
}

/* field G: kaleidoscope \u2014 fold the angle into mirrored sectors over fbm.
   warp adds sectors (3 -> ~9) for a denser mandala. */
float fieldKaleido(vec2 p, float t){
  float ang = atan(p.y, p.x);
  float rad = length(p);
  float sectors = 3.0 + floor(u_warp * 0.7);
  float seg = 6.2831853 / sectors;
  ang = mod(ang, seg);
  ang = abs(ang - 0.5 * seg);
  vec2 q = vec2(cos(ang), sin(ang)) * rad;
  return spreadF(fbm(q * 1.6 + vec2(t * 0.35, t * 0.12)), 1.6);
}

/* field H: lines \u2014 rotated parallel bands; warp rotates + tightens them, a gentle
   wave keeps them from being dead-straight */
float fieldLines(vec2 p, float t){
  float ang = u_warp * 0.35;
  float c = cos(ang), s = sin(ang);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float freq = 5.0 + u_warp * 1.4;
  return 0.5 + 0.5 * sin(q.x * freq + t * 0.6 + 0.6 * sin(q.y * 0.7 + t * 0.5));
}

/* field I: grid \u2014 two crossed sine rulings -> a clean lattice; warp sets density */
float fieldGrid(vec2 p, float t){
  float freq = 4.0 + u_warp * 1.4;
  float gx = sin(p.x * freq + t * 0.5);
  float gy = sin(p.y * freq - t * 0.5);
  float lines = max(gx, gy);            /* bright where either ruling peaks */
  float nodes = gx * gy;                /* brightest at the crossings */
  return spreadF(0.5 + 0.5 * mix(lines, nodes, 0.35), 1.5);
}

/* field J: golden \u2014 phyllotaxis / sunflower via the Vogel model (golden angle).
   seed index ~ r^2; the golden angle 2.39996 rad spaces the spiral arms. */
float fieldGolden(vec2 p, float t){
  float r = length(p) * (1.3 + u_warp * 0.18);
  float a = atan(p.y, p.x);
  float n = r * r;
  float spiral = cos(a - n * 2.39996323 + t * 0.55);
  float rings = cos(n * 3.14159265 - t * 0.28);
  return 0.5 + 0.5 * spiral * rings;
}
float fieldSmoke(vec2 p, float t){
  /* volumetric smoke: two-step domain-warped fbm for billowing bodies + finer
     wisps, dark-biased so the bulk falls into shadow. The warp layers are driven
     by small bounded multi-phase sways at different rates, so the body churns in
     place instead of sliding as a sheet; precision-safe. */
  float w = max(u_warp, 1.0);
  vec2 a1 = vec2(sin(t * 0.2), cos(t * 0.17)) * 0.8;
  vec2 a2 = vec2(cos(t * 0.15), sin(t * 0.24)) * 0.8;
  vec2 q = vec2(fbm(p + a1), fbm(p + vec2(5.2, 1.3) - a2));
  vec2 r = vec2(fbm(p + w * 0.42 * q + vec2(1.7, 9.2) + a2),
               fbm(p + w * 0.42 * q + vec2(8.3, 2.8) - a1));
  float body = fbm(p + w * 0.5 * r);
  float fine = fbm(p * 2.4 + r * 1.6 + a1 * 0.4);
  float d = body * 0.72 + fine * 0.28;
  return pow(clamp((d - 0.15) * 1.65, 0.0, 1.0), 1.6);
}

/* field L: quasicrystal \u2014 sum of plane-wave gratings at evenly spaced angles gives crisp
   N-fold rotational symmetry (the classic 5-fold quasicrystal). warp picks the order. */
float fieldQuasi(vec2 p, float t){
  float n = 5.0 + floor(u_warp * 0.6);
  float v = 0.0;
  for (int i = 0; i < 12; i++){
    float on = step(float(i), n - 0.5);
    float a = 3.14159265 * float(i) / max(n, 1.0);
    v += on * cos((p.x * cos(a) + p.y * sin(a)) * 8.0 + t * 0.65);
  }
  return spreadF(0.5 + 0.5 * (v / n), 1.5);
}

/* field M: honeycomb \u2014 a true hexagonal lattice (reuses hexCenter from the hex screen).
   each cell pulses from its own hash, with crisp hexagonal walls between cells. warp = density. */
float fieldHoneycomb(vec2 p, float t){
  vec2 hp = p * (1.3 + u_warp * 0.35);
  vec2 c = hexCenter(hp);
  vec2 gv = hp - c;
  float hd = max(abs(gv.x), max(abs(0.5 * gv.x + 0.8660254 * gv.y), abs(-0.5 * gv.x + 0.8660254 * gv.y)));
  float cell = 0.5 + 0.5 * sin(hash(c) * 6.2831853 + t * 0.7);
  float wall = smoothstep(0.40, 0.48, hd);
  return mix(cell, 0.04, wall);
}

/* smooth 4-stop designer gradient (dark -> light) */
vec3 ramp4(float t, vec3 a, vec3 b, vec3 c, vec3 d){
  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(a, b, smoothstep(0.0, 0.34, t));
  col = mix(col, c, smoothstep(0.33, 0.67, t));
  col = mix(col, d, smoothstep(0.66, 1.0, t));
  return col;
}
vec3 palChrome(float f){
  float band = sin(f * 22.0);
  vec3 c = vec3(0.10 + 0.82 * f) * (0.78 + 0.22 * band);
  float edge = pow(1.0 - abs(band), 4.0);
  vec3 sheen = 0.5 + 0.5 * cos(6.28318 * (f * 3.0 + vec3(0.0, 0.33, 0.67)));
  return c + sheen * edge * 0.22;
}

/* bloom engine (13): a true mesh gradient \u2014 the 4 palette stops live at drifting 2D
   anchor points and blend by distance, instead of riding the 1D ramp. bloomW returns
   the 4 normalized blob weights; the scalar field (for dither/material/mask edges) is
   the weighted ramp position, the colour stage blends the stop colours directly. */
vec2 bloomAnchor(int i, float t){
  float fi = float(i);
  float aa = u_seed * 0.61803 + fi * 2.399963;              /* golden-angle ring: guaranteed spread */
  float rr = 1.05 + 0.35 * sin(u_seed * 1.3 + fi * 2.1);
  vec2 base = vec2(cos(aa), sin(aa)) * rr;
  float w1 = 0.05 + 0.023 * fi;                             /* non-commensurate drift rates */
  float w2 = 0.041 + 0.017 * fi;
  return base + vec2(sin(t * w1 + aa * 3.0), cos(t * w2 + aa * 1.7)) * 0.45;
}
vec4 bloomW(vec2 p, float t){
  /* wobble the domain so blob edges go organic instead of perfectly radial */
  vec2 q = p + (vec2(fbm(p * 0.7 + t * 0.04), fbm(p * 0.7 + vec2(4.1, 7.7) - t * 0.03)) - 0.5) * u_warp * 0.35;
  vec4 w;
  w.x = exp(-dot(q - bloomAnchor(0, t), q - bloomAnchor(0, t)) * 1.4);
  w.y = exp(-dot(q - bloomAnchor(1, t), q - bloomAnchor(1, t)) * 1.4);
  w.z = exp(-dot(q - bloomAnchor(2, t), q - bloomAnchor(2, t)) * 1.4);
  w.w = exp(-dot(q - bloomAnchor(3, t), q - bloomAnchor(3, t)) * 1.4);
  return w / max(w.x + w.y + w.z + w.w, 0.0008);
}
float fieldBloom(vec2 p, float t){
  vec4 w = bloomW(p, t);
  return dot(w, vec4(0.02, 0.35, 0.68, 0.98));
}
/* sweep engine (14): the colour ramp laid CORNER-TO-CORNER across the frame -
   dark stop top-left, light stop bottom-right - with the boundary wobbled by
   drifting noise so it stays alive. Warp = wobble depth, Zoom = wobble size. */
float fieldSweep(vec2 p, float t){
  vec2 uv = p / (u_scale * 3.0);            /* undo the domain scale: frame coords */
  float tt = dot(uv, vec2(0.7071, -0.7071)) / 1.4142 + 0.5;
  float wob = (fbm(p * 0.9 + vec2(t * 0.05, 3.7 - t * 0.04)) - 0.5) * u_warp * 0.12;
  return clamp(tt + wob, 0.0, 1.0);
}

/* ordered (Bayer) dither thresholds, recursive 2x2 -> 4x4 -> 8x8, WebGL1-safe */
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }
/* evaluate any engine by index \u2014 lets the base + a second Layer share the field switch.
   out disp = noise-domain displacement (only the noise engine fills it; used by the photo melt). */
float fieldOf(int eng, vec2 p, float t, out vec2 disp){
  float d1 = 1.8 * sin(t * 0.12) + 1.2 * cos(t * 0.067);
  float d2 = 1.8 * cos(t * 0.10) + 1.2 * sin(t * 0.084);
  disp = vec2(0.5);
  if (eng == 1){ return fieldFlow(p, t); }
  else if (eng == 2){ return fieldCellular(p, t); }
  else if (eng == 3){ return fieldGyroid(p, t); }
  else if (eng == 4){ return fieldTruchet(p, t); }
  else if (eng == 5){ return fieldInterf(p, t); }
  else if (eng == 6){ return fieldKaleido(p, t); }
  else if (eng == 7){ return fieldLines(p, t); }
  else if (eng == 8){ return fieldGrid(p, t); }
  else if (eng == 9){ return fieldGolden(p, t); }
  else if (eng == 10){ return fieldSmoke(p, t); }
  else if (eng == 11){ return fieldQuasi(p, t); }
  else if (eng == 12){ return fieldHoneycomb(p, t); }
  else if (eng == 13){ return fieldBloom(p, t); }
  else if (eng == 14){ return fieldSweep(p, t); }
  vec2 m1 = vec2(d1, d2);
  vec2 m2 = vec2(d2, -d1);
  vec2 q = vec2(fbm(p + m1 * 0.5), fbm(p + vec2(5.2, 1.3) + m2 * 0.5));
  disp = vec2(
    fbm(p + u_warp * q + vec2(1.7, 9.2) + m1),
    fbm(p + u_warp * q + vec2(8.3, 2.8) + m2)
  );
  return spreadF(fbm(p + u_warp * disp), 1.5);
}
/* field-level layer blend: composite engine b over engine a. amt = layer strength. */
float blendField(float a, float b, int mode, float amt){
  float r;
  if (mode == 1){ r = a * b; }                                            /* multiply */
  else if (mode == 2){ r = 1.0 - (1.0 - a) * (1.0 - b); }                 /* screen */
  else if (mode == 3){ r = min(a + b, 1.0); }                            /* add */
  else if (mode == 4){ r = abs(a - b); }                                 /* difference */
  else if (mode == 5){ r = a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b); } /* overlay */
  else { r = b; }                                                        /* 0 = normal */
  return mix(a, r, amt);
}
/* material finish: treat the field as a height map (screen-space gradient -> normal) and
   re-light the palette colour as glass / metal / sand / liquid / molten. mat 0 = off.
   fv = the raw field value \u2014 molten draws its ribbons on its level sets. */
vec3 shadeMaterial(int mat, vec3 base, vec3 N, float fv){
  vec3 L = normalize(vec3(0.4, 0.7, 0.6));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float fres = pow(1.0 - max(N.z, 0.0), 2.5);
  vec3 col = base;
  if (mat == 1){          /* glass \u2014 dark refractive body, bright fresnel rim + sharp spec */
    col = base * (0.35 + 0.25 * ndl) + fres * (base + 0.7) + pow(ndh, 80.0) * 1.5;
  } else if (mat == 2){   /* metal \u2014 chrome: env reflection (sky/ground by N.y) + hot spec */
    vec3 env = mix(base * 0.15 + 0.02, base * 0.7 + 0.55, smoothstep(-0.6, 0.6, N.y));
    col = env + pow(ndh, 40.0) * 2.0 + fres * 0.5;
  } else if (mat == 3){   /* sand \u2014 matte grain + soft ambient occlusion, no spec */
    float ao = clamp(0.5 + 0.5 * N.z, 0.0, 1.0);
    col = base * (0.4 + 0.6 * ndl) * ao + (hash(gl_FragCoord.xy * 1.91) - 0.5) * 0.18;
  } else if (mat == 4){   /* liquid \u2014 wet sheen: glossy spec + fresnel highlights */
    col = base * (0.5 + 0.4 * ndl) + pow(ndh, 28.0) * 1.3 + fres * 0.4 * (base + 0.3);
  } else if (mat == 5){   /* molten \u2014 liquid metal: near-black body, luminous ribbons riding
                             the fold CONTOURS (level sets of the field \u2014 smooth curves even
                             where the per-pixel normals are noisy), hot specular core */
    float ph = fv * 12.56637;                               /* ~2 ribbons per field octave */
    float s1 = 0.5 + 0.5 * sin(ph);
    float s2 = 0.5 + 0.5 * sin(ph * 2.618 + 1.7);
    float bands = pow(s1, 12.0) * 1.35 + pow(s2, 34.0) * 0.85;
    float sheen = pow(s1, 3.0) * 0.20;                      /* wide under-glow so the body reads as metal */
    vec3 tint = base / max(max(base.r, max(base.g, base.b)), 0.12);  /* palette hue at full brightness */
    col = base * 0.12 + 0.012
        + tint * (bands + sheen) * (0.75 + 0.25 * ndl)
        + tint * pow(ndh, 60.0) * 1.6
        + fres * tint * 0.15;
  }
  return col;
}
void main(){
  /* 0 - before/after: left of the split shows the untouched source */
  if (u_hasTex > 0.5 && u_split > 0.001 && gl_FragCoord.x < u_res.x * u_split){
    vec2 st0 = gl_FragCoord.xy / u_res;
    float ca0 = u_res.x / u_res.y;
    vec2 t0 = st0 - 0.5;
    if (ca0 > u_texAspect){ t0.y *= u_texAspect / ca0; }
    else { t0.x *= ca0 / u_texAspect; }
    t0 += 0.5 + u_pan;
    gl_FragColor = vec4(texture2D(u_tex, clamp(t0, 0.0, 1.0)).rgb, 1.0);
    return;
  }

  /* 1 - screen geometry: square (default) / hex / ascii \u2014 quantize coords */
  float csA = max(u_pixel, 8.0);
  vec2 fc = gl_FragCoord.xy;
  if (u_screen == 1){
    float cs = max(u_pixel, 3.0);
    fc = hexCenter(fc / cs) * cs;
  } else if (u_screen == 2){
    fc = (floor(fc / csA) + 0.5) * csA;
  } else if (u_screen == 3){
    float cd = max(u_pixel, 3.0);
    fc = (floor(fc / cd) + 0.5) * cd;
  } else if (u_screen == 4){
    float cg = max(u_pixel, 4.0);
    fc = (floor(fc / cg) + 0.5) * cg;
  } else if (u_pixel > 1.5){
    fc = (floor(fc / u_pixel) + 0.5) * u_pixel;
  }

  /* 2 - field: centered uv normalized by the geometric mean of w,h so forms stay
     isotropic (square stays square) AND the SAME amount of field shows at every
     aspect ratio \u2014 a portrait reveals more vertically instead of zooming in.
     (1:1 is unchanged: sqrt(s*s) == s) */
  float mn = sqrt(u_res.x * u_res.y);
  vec2 uv = (fc - 0.5 * u_res) / mn;
  vec2 p = uv * u_scale * 3.0;
  /* cursor effect: mode 1=ripple 2=lens 3=vortex 4=push */
  if (u_mouseAmt > 0.001 && u_mouseMode > 0){
    vec2 mUv = (u_mouse * u_res - 0.5 * u_res) / mn;
    vec2 dv = uv - mUv;
    float md = length(dv);
    if (u_mouseMode == 1){
      vec2 nz = vec2(fbm(dv * 6.0 + u_time * 0.3), fbm(dv * 6.0 + vec2(7.3, 2.1) - u_time * 0.25)) - 0.5;
      float env = exp(-md * 9.0);
      float wave = cos((md + nz.x * 0.12) * 30.0 - u_time * 2.0);
      vec2 dir = normalize(dv / max(md, 0.0008) + nz * 0.9);
      p += dir * wave * env * u_mouseAmt * 0.08;
    } else if (u_mouseMode == 2){
      float env = exp(-md * 5.0);
      p -= dv * env * u_mouseAmt * 0.5;
    } else if (u_mouseMode == 3){
      float angle = u_mouseAmt * 3.0 * exp(-md * 4.0);
      float ca = cos(angle), sa = sin(angle);
      p += vec2(dv.x * ca - dv.y * sa, dv.x * sa + dv.y * ca) - dv;
    } else if (u_mouseMode == 4){
      float env = exp(-md * 5.0);
      p += normalize(dv / max(md, 0.0008)) * env * u_mouseAmt * 0.28;
    }
  }
  /* time evolution: small, bounded, multi-frequency sway. The old large single-
     frequency offset translated the whole field like a rigid sheet; mixing low
     amplitudes at non-commensurate rates makes the field churn in place instead,
     and staying sin-bounded keeps it precision-safe over long sessions. */
  vec2 disp = vec2(0.5);
  float f;
  /* symmetry modifier: fold the field coordinate into N mirrored wedges -> instant mandala
     of whatever engine is selected. u_sym < 2 leaves it untouched. */
  if (u_sym >= 1.5){
    float ka = atan(p.y, p.x);
    float kr = length(p);
    float kseg = 6.2831853 / u_sym;
    ka = mod(ka, kseg);
    ka = abs(ka - 0.5 * kseg);
    p = vec2(cos(ka), sin(ka)) * kr;
  }
  /* base layer, then optionally composite a 2nd engine on the same domain (Layers) */
  f = fieldOf(u_field, p, u_time, disp);
  if (u_layerMix > 0.001){
    vec2 disp2;
    f = blendField(f, fieldOf(u_field2, p, u_time, disp2), u_blend, u_layerMix);
  }
  if (u_hasTex > 0.5 && u_field != 0){
    float d1 = 1.8 * sin(u_time * 0.12) + 1.2 * cos(u_time * 0.067);
    float d2 = 1.8 * cos(u_time * 0.10) + 1.2 * sin(u_time * 0.084);
    disp = vec2(fbm(p + vec2(1.7, 9.2) + d1), fbm(p + vec2(8.3, 2.8) + d2));
  }
  f = smoothstep(0.08, 0.92, f); /* gentle spread \u2014 keep gradients smooth */

  /* 3 - photo blend: cover-fit, liquified by disp, luminance into f */
  if (u_hasTex > 0.5){
    vec2 st = fc / u_res;
    float ca = u_res.x / u_res.y;
    vec2 tuv = st - 0.5;
    if (ca > u_texAspect){ tuv.y *= u_texAspect / ca; }
    else { tuv.x *= ca / u_texAspect; }
    tuv += 0.5 + u_pan;
    tuv += (disp - 0.5) * u_liq * 0.25;
    vec3 ts = texture2D(u_tex, clamp(tuv, 0.0, 1.0)).rgb;
    float lum = dot(ts, vec3(0.299, 0.587, 0.114));
    f = mix(f, lum, u_mix);
  }

  /* 4 - palette: Chrome is procedural; every other palette (presets + custom)
       is a 4-stop ramp fed by colour uniforms set on the JS side.
       Bloom (13) blends the stop COLOURS by blob weight \u2014 orange meets blue
       directly instead of detouring through the middle of the ramp. */
  vec3 col;
  if (u_field == 13 && u_hasTex < 0.5 && u_pal != 7){
    vec4 bw = bloomW(p, u_time);
    col = bw.x * u_c0 + bw.y * u_c1 + bw.z * u_c2 + bw.w * u_c3;
  }
  else if (u_pal == 7){ col = palChrome(f); }
  else           { col = ramp4(f, u_c0, u_c1, u_c2, u_c3); }
  /* soft highlight bloom for a premium glow */
  col += smoothstep(0.72, 1.0, f) * 0.12;
  /* 4b - material finish: field gradient -> normal, re-light as glass/metal/sand/liquid */
  if (u_material > 0){
    vec2 grd = vec2(dFdx(f), dFdy(f)) * u_res.y * 0.06;
    col = shadeMaterial(u_material, col, normalize(vec3(-grd, 1.0)), f);
  }

  /* 5 - halftone in real (un-pixelated) coords (square screen only) */
  if (u_dots > 0.5 && u_screen == 0){
    vec2 g = mod(gl_FragCoord.xy, u_dot) - 0.5 * u_dot;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float radius = 0.5 * u_dot * sqrt(clamp(lum, 0.0, 1.0)) * 0.92;
    float dm = 1.0 - smoothstep(radius - 0.8, radius + 0.8, length(g));
    col = mix(col * 0.12, col * 1.12, dm);
  }

  /* 5b - ascii: cell brightness picks a glyph from the atlas */
  if (u_screen == 2){
    float lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float gi = floor(lum * 9.999);
    vec2 cl = fract(gl_FragCoord.xy / csA);
    vec2 guv = vec2((gi + cl.x) / 10.0, 1.0 - cl.y);
    col *= texture2D(u_glyph, guv).r;
  }

  /* 5c - ordered dither: quantize the field to a 2-tone palette (c1 -> c3).
     Threshold biases the field so the bright dots grow denser or sparser. */
  if (u_screen == 3){
    float cd = max(u_pixel, 3.0);
    float bit = step(bayer8(gl_FragCoord.xy / cd), clamp(f + (u_dither - 0.5), 0.0, 1.0));
    col = mix(u_c1, u_c3, bit);
  }

  /* 5d - glitch: chromatic-aberration on the field contours, black elsewhere (RGB channel split) */
  if (u_screen == 4){
    float lev = clamp(0.5 + (u_dither - 0.5) * 0.6, 0.18, 0.82);  /* Threshold shifts which contour shows */
    float bw = 0.018;                                            /* narrow band -> thin sparse contours on black */
    col = vec3(
      1.0 - smoothstep(bw, bw * 2.6, abs(f - (lev - 0.05))),
      1.0 - smoothstep(bw, bw * 2.6, abs(f - lev)),
      1.0 - smoothstep(bw, bw * 2.6, abs(f - (lev + 0.05)))
    );
  }

  /* 6 - grain + vignette */
  float grPhase = mix(mod(floor(u_time * 10.0), 61.0) * 1.7, 23.0, u_rec);
  float gr = hash(gl_FragCoord.xy * 0.731 + grPhase) - 0.5;
  col += gr * u_grain * mix(1.0, 0.28, u_rec);
  col *= 1.0 - 0.22 * dot(uv, uv);

  /* 7 - text/logo mask: the living field fills the letters, clean bg outside.
       The background is solid u_maskBg, or a vertical A->B gradient when u_maskGrad. */
  if (u_hasMask > 0.5){
    float mk = texture2D(u_mask, vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y)).r;
    vec3 mbg = mix(u_maskBg, u_maskBg2, u_maskGrad * (1.0 - gl_FragCoord.y / u_res.y));
    col = mix(mbg, col, smoothstep(0.42, 0.58, mk));
  }

  gl_FragColor = vec4(col, 1.0);
}`;var h=["noise","flow","cellular","gyroid","truchet","interfere","kaleido","lines","grid","golden","smoke","crystal","honeycomb","bloom","sweep"];var b=["aurora","sunset","ocean","dusk","ember","mint","iris","chrome"],u=[[[.035,.063,.16],[.05,.42,.45],[.27,.78,.55],[.96,.74,.84]],[[.1,.045,.18],[.52,.12,.42],[.93,.4,.25],[.99,.84,.52]],[[.02,.05,.14],[.04,.29,.5],[.18,.66,.76],[.78,.96,.91]],[[.085,.078,.2],[.35,.22,.55],[.7,.49,.77],[.97,.8,.87]],[[.035,.02,.02],[.49,.1,.1],[.9,.45,.13],[.98,.9,.72]],[[.03,.13,.11],[.12,.43,.35],[.45,.83,.67],[.93,.99,.95]],[[.04,.03,.1],[.27,.14,.62],[.4,.62,.95],[.92,.86,.99]]],x=["square","hex","ascii","dither","glitch"],y=["none","glass","metal","sand","liquid","molten"],w=["normal","multiply","screen","add","difference","overlay"],k=[{label:"BOREALIS",field:0,p:[.4,2,3.5,.03,1,10,0,0,30,0,0,1]},{label:"AFTERGLOW",field:1,p:[.5,1.6,4,.03,1,10,0,1,21,0,0,1]},{label:"TIDE",field:1,p:[.5,1.5,5,.03,1,10,0,2,48,0,0,1]},{label:"TWILIGHT",field:0,p:[.35,2.3,3,.03,1,10,0,3,12,0,0,1]},{label:"MAGMA",field:0,p:[.45,1.8,4.5,.03,1,10,0,4,52,0,0,1]},{label:"MERIDIAN",field:1,p:[.5,1.6,5,.03,1,10,0,5,66,0,0,1]},{label:"NEBULA",field:2,p:[.4,1.9,7,.03,1,8,0,6,40,0,0,1]},{label:"PLASMA",field:1,p:[.7,1.2,8,.04,1,10,0,0,71,0,0,1]},{label:"VELVET",field:0,p:[.3,2.6,2,.02,1,10,0,3,18,0,0,1]},{label:"CORAL",field:2,p:[.45,1.8,7,.03,1,10,0,1,33,0,0,1]},{label:"GLACIER",field:0,p:[.4,2.2,3,.03,1,10,0,2,25,0,0,1]},{label:"ONYX",field:2,p:[.4,1.9,8,.03,1,8,0,7,60,0,0,1]},{label:"WEAVE",field:3,p:[.4,1.6,5,.03,1,10,0,5,40,0,0,1]},{label:"CIRCUIT",field:4,p:[.3,2,4,.02,1,10,0,7,22,0,0,1]},{label:"RIPPLE",field:5,p:[.5,1.4,5,.03,1,10,0,2,30,0,0,1]},{label:"MANDALA",field:6,p:[.35,1.5,6,.03,1,10,0,6,55,0,0,1]},{label:"STRATA",field:7,p:[.3,1.6,3,.02,1,10,0,3,28,0,0,1]},{label:"MESH",field:8,p:[.3,1.8,4,.02,1,10,0,5,33,0,0,1]},{label:"SUNFLOWER",field:9,p:[.3,1.4,5,.02,1,10,0,4,44,0,0,1]},{label:"RIBBON",field:3,p:[.3,1.55,4.8,.02,4,9,1,2,28,0,0,.5625]},{label:"VORTEX",field:6,p:[.34,1.18,7.2,.02,6,10,1,5,61,0,0,.5625]},{label:"ABYSS",field:0,p:[.22,2.25,7.6,.03,5,8,1,2,87,0,0,.5625]},{label:"NOVA",field:5,p:[.32,1.18,6.4,.02,4,7,1,7,52,0,0,.5625]},{label:"PIXELBEAM",field:1,screen:3,thresh:.46,p:[.45,1.6,4,0,7,10,0,4,40,0,0,1]},{label:"SMOKE",field:10,cols:["#040414","#0a3a7a","#0484fc","#c2dbdc"],p:[.38,1.3,3,.015,1,10,0,0,30,0,0,1]},{label:"GILDED",field:0,material:5,cols:["#0a0602","#6b3a05","#e8940f","#ffdf8a"],p:[.28,.6,3.5,.015,1,10,0,0,47,0,0,1]},{label:"MERCURY",field:0,material:5,cols:["#020204","#1c1a2e","#5a5670","#e8e0f2"],p:[.28,.7,4,.015,1,10,0,0,61,0,0,1]},{label:"BLOOM",field:13,cols:["#c2b830","#e04a12","#e8489a","#f2ead8"],p:[.35,.95,2.5,.14,1,10,0,0,24,0,0,1]},{label:"HORIZON",field:14,cols:["#0d0b2e","#552a8a","#f27059","#ffd9a0"],p:[.3,1.2,3.2,.05,1,10,0,0,33,0,0,1]}];var M=3840*2160;function R(a){return a=String(a).replace("#",""),a.length===3&&(a=a[0]+a[0]+a[1]+a[1]+a[2]+a[2]),[parseInt(a.substr(0,2),16)/255,parseInt(a.substr(2,2),16)/255,parseInt(a.substr(4,2),16)/255]}function p(a){return Math.round(a[0]*255)*65536+Math.round(a[1]*255)*256+Math.round(a[2]*255)}function c(a,e){return typeof e=="number"?e>=0&&e<a.length?Math.round(e):-1:a.indexOf(String(e).toLowerCase())}var O={field:0,field2:0,blend:0,layerMix:0,screen:0,material:0,sym:0,pal:0,cols:null,speed:.6,zoom:1.6,warp:4.5,grain:.06,pixel:1,dot:10,dots:0,thresh:.5,seed:null};function B(a){let e=" .:-=+*#%@",n=a.createElement("canvas");n.width=28*e.length,n.height=28;let o=n.getContext("2d");o.fillStyle="#000",o.fillRect(0,0,n.width,n.height),o.fillStyle="#fff",o.font="bold "+Math.round(28*.82)+"px ui-monospace, Menlo, Consolas, monospace",o.textAlign="center",o.textBaseline="middle";for(let i=0;i<e.length;i++)o.fillText(e.charAt(i),i*28+28/2,28/2+1);return n}var g=class{constructor(e,t={}){if(!e||e.nodeType!==1)throw new Error("fluid-core: container must be an element");this.container=e,this.doc=e.ownerDocument,this.state=Object.assign({},O),this._applyParams(t),this.state.seed==null&&(this.state.seed=3+Math.random()*89),this.canvas=this.doc.createElement("canvas"),this.canvas.style.cssText="display:block;width:100%;height:100%;",e.appendChild(this.canvas),this.t=0,this._raf=null,this._last=0,this._destroyed=!1,this._visible=!0,this._needsPaint=!0;let n=typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches&&t.respectReducedMotion!==!1;this._playing=t.paused?!1:!n,this._initGL(),this._ro=typeof ResizeObserver=="function"?new ResizeObserver(()=>{this._needsPaint=!0,this._kick()}):null,this._ro&&this._ro.observe(e),this._io=typeof IntersectionObserver=="function"?new IntersectionObserver(o=>{this._visible=!!(o[0]&&o[0].isIntersecting),this._kick()}):null,this._io&&this._io.observe(e),this._onVis=()=>this._kick(),this.doc.addEventListener("visibilitychange",this._onVis),this._onLost=o=>{o.preventDefault(),this._stopLoop()},this._onRestored=()=>{this._initGL(),this._needsPaint=!0,this._kick()},this.canvas.addEventListener("webglcontextlost",this._onLost),this.canvas.addEventListener("webglcontextrestored",this._onRestored),this._kick()}set(e){return this._applyParams(e),this._needsPaint=!0,this._kick(),this}play(){return this._playing=!0,this._kick(),this}pause(){return this._playing=!1,this._kick(),this}get playing(){return this._playing}shareUrl(e="https://fluid.krackeddevs.com/",t=!1){let n=this.state,o=this.canvas.clientHeight>0?this.canvas.clientWidth/this.canvas.clientHeight:1,i=[+n.speed.toFixed(2),+n.zoom.toFixed(2),+n.warp.toFixed(1),+n.grain.toFixed(3),Math.round(n.pixel),Math.round(n.dot),n.dots?1:0,n.pal,+n.seed.toFixed(2),.8,.85,+o.toFixed(4),0,t?1:0,n.field,n.screen,0,0,Math.round(n.sym||0),0];n.pal===8&&i.push(p(n.cols[0]),p(n.cols[1]),p(n.cols[2]),p(n.cols[3]));let r=+(n.thresh-.5).toFixed(2);if(r!==0){for(;i.length<24;)i.push(0);i.push(r)}if((n.layerMix||0)>.001){for(;i.length<25;)i.push(0);i.push(n.field2||0,n.blend||0,Math.round(n.layerMix*100))}if((n.material||0)>0){for(;i.length<28;)i.push(0);i.push(Math.round(n.material))}let s=n.pal===8?24:12;for(;i.length>s&&i[i.length-1]===0;)i.pop();return e+"#p="+i.join(",")}toDataURL(e="image/png",t){return this._resize(),this._render(),this.canvas.toDataURL(e,t)}destroy(){this._destroyed=!0,this._stopLoop(),this._ro&&this._ro.disconnect(),this._io&&this._io.disconnect(),this.doc.removeEventListener("visibilitychange",this._onVis),this.canvas.removeEventListener("webglcontextlost",this._onLost),this.canvas.removeEventListener("webglcontextrestored",this._onRestored);let e=this.gl&&this.gl.getExtension("WEBGL_lose_context");if(e)try{e.loseContext()}catch{}this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas)}_applyParams(e){let t=this.state;if(e.look!=null){let n=k.find(i=>i.label.toLowerCase()===String(e.look).toLowerCase());if(!n)throw new Error('fluid-core: unknown look "'+e.look+'"');let o=n.p;t.speed=o[0],t.zoom=o[1],t.warp=o[2],t.grain=o[3],t.pixel=o[4],t.dot=o[5],t.dots=o[6],t.pal=o[7],t.seed=o[8],t.field=n.field||0,t.screen=n.screen||0,t.material=n.material||0,t.thresh=n.thresh!=null?n.thresh:.5,n.cols&&(t.pal=8,t.cols=n.cols.map(R))}if(e.field!=null){let n=c(h,e.field);if(n<0)throw new Error('fluid-core: unknown field "'+e.field+'" \u2014 valid: '+h.join(", "));t.field=n}if(e.layer!=null)if(e.layer===!1||e.layer.mix===0)t.field2=0,t.blend=0,t.layerMix=0;else{let n=c(h,e.layer.field!=null?e.layer.field:0),o=c(w,e.layer.blend!=null?e.layer.blend:"screen");if(n<0)throw new Error("fluid-core: unknown layer.field");if(o<0)throw new Error("fluid-core: unknown layer.blend \u2014 valid: "+w.join(", "));t.field2=n,t.blend=o,t.layerMix=e.layer.mix!=null?Math.max(0,Math.min(1,e.layer.mix)):.5}if(e.colors!=null){if(!Array.isArray(e.colors)||e.colors.length!==4)throw new Error("fluid-core: colors must be 4 hex stops, dark -> light");t.pal=8,t.cols=e.colors.map(R)}else if(e.palette!=null){let n=c(b,e.palette);if(n<0)throw new Error('fluid-core: unknown palette "'+e.palette+'" \u2014 valid: '+b.join(", "));t.pal=n}if(e.screen!=null){let n=e.screen==="none"?0:c(x,e.screen);if(n<0)throw new Error("fluid-core: unknown screen \u2014 valid: "+x.join(", "));t.screen=n,e.pixel==null&&e.look==null&&n>0&&t.pixel<=1.5&&(t.pixel=6)}if(e.material!=null){let n=c(y,e.material);if(n<0)throw new Error("fluid-core: unknown material \u2014 valid: "+y.join(", "));t.material=n}for(let n of["speed","zoom","warp","grain","pixel","dot","dots","thresh","sym","seed"])e[n]!=null&&(t[n]=+e[n])}_initGL(){let e=this.canvas.getContext("webgl",{preserveDrawingBuffer:!0})||this.canvas.getContext("experimental-webgl",{preserveDrawingBuffer:!0});if(!e)throw new Error("fluid-core: WebGL is not available");this.gl=e,e.getExtension("OES_standard_derivatives");let t=(f,m)=>{let d=e.createShader(f);if(e.shaderSource(d,m),e.compileShader(d),!e.getShaderParameter(d,e.COMPILE_STATUS))throw new Error("fluid-core shader: "+e.getShaderInfoLog(d));return d},n=e.createProgram();e.attachShader(n,t(e.VERTEX_SHADER,A)),e.attachShader(n,t(e.FRAGMENT_SHADER,L)),e.linkProgram(n),e.useProgram(n);let o=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,o),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),e.STATIC_DRAW);let i=e.getAttribLocation(n,"a_pos");e.enableVertexAttribArray(i),e.vertexAttribPointer(i,2,e.FLOAT,!1,0,0),this.U={},["u_res","u_time","u_seed","u_scale","u_warp","u_sym","u_pixel","u_dots","u_dot","u_dither","u_grain","u_pal","u_c0","u_c1","u_c2","u_c3","u_tex","u_hasTex","u_texAspect","u_liq","u_mix","u_split","u_field","u_field2","u_blend","u_layerMix","u_screen","u_material","u_glyph","u_pan","u_mouse","u_mouseAmt","u_mouseMode","u_rec","u_mask","u_hasMask","u_maskBg","u_maskBg2","u_maskGrad"].forEach(f=>{this.U[f]=e.getUniformLocation(n,f)});let r=f=>{e.activeTexture(e.TEXTURE0+f);let m=e.createTexture();return e.bindTexture(e.TEXTURE_2D,m),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,255])),m};r(0),e.uniform1i(this.U.u_tex,0),e.activeTexture(e.TEXTURE1);let s=e.createTexture();e.bindTexture(e.TEXTURE_2D,s),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,B(this.doc)),e.uniform1i(this.U.u_glyph,1),r(2),e.uniform1i(this.U.u_mask,2),e.activeTexture(e.TEXTURE0)}_resize(){let e=this.container.clientWidth||1,t=this.container.clientHeight||1,n=Math.min((typeof devicePixelRatio=="number"?devicePixelRatio:1)||1,2);e*t*n*n>M&&(n=Math.max(1,Math.sqrt(M/(e*t))));let o=Math.max(1,Math.round(e*n)),i=Math.max(1,Math.round(t*n));(this.canvas.width!==o||this.canvas.height!==i)&&(this.canvas.width=o,this.canvas.height=i)}_render(){let e=this.gl,t=this.U,n=this.state;if(!e||e.isContextLost())return;let o=this.canvas.clientWidth>0?this.canvas.width/this.canvas.clientWidth:1;e.viewport(0,0,this.canvas.width,this.canvas.height),e.uniform2f(t.u_res,this.canvas.width,this.canvas.height),e.uniform1f(t.u_time,this.t),e.uniform1f(t.u_seed,n.seed),e.uniform1f(t.u_scale,n.zoom),e.uniform1f(t.u_warp,n.warp),e.uniform1f(t.u_sym,n.sym),e.uniform1f(t.u_pixel,n.pixel<=1.5?1:n.pixel*o),e.uniform1f(t.u_dots,n.dots),e.uniform1f(t.u_dot,n.dot*o),e.uniform1f(t.u_dither,n.thresh),e.uniform1f(t.u_grain,n.grain),e.uniform1i(t.u_pal,n.pal);let i=n.pal===8&&n.cols?n.cols:u[n.pal]||u[0];e.uniform3f(t.u_c0,i[0][0],i[0][1],i[0][2]),e.uniform3f(t.u_c1,i[1][0],i[1][1],i[1][2]),e.uniform3f(t.u_c2,i[2][0],i[2][1],i[2][2]),e.uniform3f(t.u_c3,i[3][0],i[3][1],i[3][2]),e.uniform1f(t.u_hasTex,0),e.uniform1f(t.u_texAspect,1),e.uniform1f(t.u_liq,.8),e.uniform1f(t.u_mix,.85),e.uniform1f(t.u_split,0),e.uniform1i(t.u_field,n.field),e.uniform1i(t.u_field2,n.field2||0),e.uniform1i(t.u_blend,n.blend||0),e.uniform1f(t.u_layerMix,n.layerMix||0),e.uniform1i(t.u_screen,n.screen),e.uniform1i(t.u_material,n.material||0),e.uniform2f(t.u_pan,0,0),e.uniform2f(t.u_mouse,.5,.5),e.uniform1f(t.u_mouseAmt,0),e.uniform1i(t.u_mouseMode,1),e.uniform1f(t.u_rec,0),e.uniform1f(t.u_hasMask,0),e.uniform3f(t.u_maskBg,.05,.05,.06),e.uniform3f(t.u_maskBg2,.16,.16,.27),e.uniform1f(t.u_maskGrad,0),e.drawArrays(e.TRIANGLES,0,3)}_shouldAnimate(){return!this._destroyed&&this._playing&&this.state.speed!==0&&this._visible&&this.doc.visibilityState!=="hidden"}_kick(){if(!this._destroyed)if(this._shouldAnimate()){if(this._raf==null){this._last=0;let e=t=>{if(this._raf=null,!this._shouldAnimate()){this._needsPaint&&this._paintOnce();return}let n=this._last?Math.min((t-this._last)/1e3,.1):0;this._last=t,this.t+=n*this.state.speed,this._resize(),this._render(),this._needsPaint=!1,this._raf=requestAnimationFrame(e)};this._raf=requestAnimationFrame(e)}}else this._needsPaint&&this._paintOnce()}_paintOnce(){this._destroyed||(this._resize(),this._render(),this._needsPaint=!1)}_stopLoop(){this._raf!=null&&(cancelAnimationFrame(this._raf),this._raf=null)}};function E(a,e){return new g(a,e)}function _(a){return a=Math.max(0,Math.round(a)),[Math.floor(a/65536)%256/255,Math.floor(a/256)%256/255,a%256/255]}function U(a){let e=t=>{let n=Math.max(0,Math.min(255,Math.round(t*255))).toString(16);return n.length<2?"0"+n:n};return"#"+e(a[0])+e(a[1])+e(a[2])}var l=(a,e,t)=>Math.min(t,Math.max(e,Math.round(a)));function v(a){let e=String(a||""),t=e.indexOf("#p=");t>=0?e=e.slice(t+3):e.indexOf("p=")===0?e=e.slice(2):e.charAt(0)==="#"&&(e=e.slice(1));let n=e.split(",").map(parseFloat);if(n.length<12||n.some(isNaN))return null;let o={speed:n[0],zoom:n[1],warp:n[2],grain:n[3],pixel:Math.round(n[4]),dot:Math.round(n[5]),dots:Math.round(n[6])?1:0,seed:n[8],ar:n[11]>=.3&&n[11]<=3?n[11]:1,field:n.length>14?l(n[14],0,14):0,screen:n.length>15?l(n[15],0,4):0,sym:n.length>18?l(n[18],0,12):0,thresh:n.length>24?Math.max(0,Math.min(1,.5+n[24])):.5,material:n.length>28?l(n[28],0,5):0},i=l(n[7],0,8);if(i===8){let s=n.length>23?[_(n[20]),_(n[21]),_(n[22]),_(n[23])]:u[0];o.colors=s.map(U)}else o.palette=i;let r=n.length>27?Math.max(0,Math.min(1,n[27]/100)):0;return r>.001&&(o.layer={field:n.length>25?l(n[25],0,14):0,blend:n.length>26?l(n[26],0,5):0,mix:r}),o}var F="https://fluid.krackeddevs.com",T="#p=0.5,1.5,5.5,0.03,1,10,0,0,18,0,0,1.7778,0,1,1",S=13;function q(a){let e=a||T;e.charAt(0)==="#"&&(e=e.slice(1)),e.indexOf("p=")===0&&(e=e.slice(2)),/^[0-9.,\-]*$/.test(e)||(e=T.replace(/^#p=/,""));let t=e.split(",");for(;t.length<=S;)t.push("0");return t[S]="1","#p="+t.join(",")}function N(a={}){let e=(a.base||F).replace(/\/+$/,"");return/^https?:\/\//i.test(e)||(e=F.replace(/\/+$/,"")),e+"/"+q(a.hash)}function D(a){if(!a)return!1;let e=getComputedStyle(a).backgroundColor;if(!e||e==="transparent")return!1;let t=e.match(/^rgba?\(([^)]+)\)/i);if(!t)return!0;let n=t[1].split(",");return(n.length>=4?parseFloat(n[3]):1)>0}var I=!1;function P(a){I||typeof document=="undefined"||typeof getComputedStyle=="undefined"||a>=0||(D(document.body)||D(document.documentElement))&&(I=!0,console.warn("[fluid-bg] A `fixed` background sits at z-index "+a+", but the page background (on <body>/<html>) is opaque and paints over it, so you'll see nothing (often a black screen). Make the page background transparent \u2014 e.g. `html, body { background: transparent }` \u2014 or raise the z-index above your page background. See https://github.com/enonforetsam/fluid/tree/master/fluid-bg#using-fixed-keep-the-page-background-transparent"))}function G(a){let e=document.createElement("iframe");return e.src=a,e.title="Fluid background",e.loading="lazy",e.setAttribute("aria-hidden","true"),e.setAttribute("tabindex","-1"),e.style.cssText="border:0;display:block;width:100%;height:100%;pointer-events:none;",e}function z(a,e){let t=v(q(e))||v(T);return E(a,t)}function C(a,e){if(e.mode!=="iframe")try{let n=z(a,e.hash);return{mode:"native",cleanup:()=>n.destroy(),mount:n}}catch{}let t=G(N(e));return a.appendChild(t),{mode:"iframe",cleanup:()=>t.remove()}}function ee(a,e={}){if(e.fixed){let i=e.z==null||isNaN(Number(e.z))?-1:Number(e.z);P(i);let r=document.createElement("div");r.style.cssText="position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:"+i+";",(a||document.body).appendChild(r);let s=C(r,e);return{el:r,mode:s.mode,destroy:()=>{s.cleanup(),r.remove()},pause:s.mount?()=>{s.mount.pause()}:void 0,play:s.mount?()=>{s.mount.play()}:void 0}}let t=a||document.body;getComputedStyle(t).position==="static"&&(t.style.position="relative");let n=document.createElement("div");n.style.cssText="position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;",t.appendChild(n);let o=C(n,e);return{el:t,mode:o.mode,destroy:()=>{o.cleanup(),n.remove()},pause:o.mount?()=>{o.mount.pause()}:void 0,play:o.mount?()=>{o.mount.play()}:void 0}}export{F as DEFAULT_BASE,T as DEFAULT_HASH,N as buildSrc,q as ensureEmbed,ee as fluidBackground,z as mountNative,P as warnIfBackgroundHidden};
//# sourceMappingURL=core.js.map
