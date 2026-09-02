import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PARAMS = { widthSegments: 512, heightSegments: 1024, planeWidth: 10, planeHeight: 14.1 };
const trackPath = window.CURRENT_TRACK_PATH || '';

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
// Recule la caméra à 22 sur l'axe Z (au lieu de 15) pour faire rentrer l'objet dans un format portrait
camera.position.set(0, -2, window.innerWidth < 768 ? 25 : 18);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const albedoTexture = textureLoader.load(`${trackPath}albedo.jpg`);
const depth1 = textureLoader.load(`${trackPath}depth1.jpg`);
const depth2 = textureLoader.load(`${trackPath}depth2.jpg`);
const depth3 = textureLoader.load(`${trackPath}depth3.jpg`);

const vertexShader = `
    uniform sampler2D u_depth1; 
    uniform sampler2D u_depth2; 
    uniform sampler2D u_depth3;
    
    uniform float u_weight1; 
    uniform float u_weight2; 
    uniform float u_weight3;
    
    uniform float u_zMultiplier; 
    uniform float u_pointSize; 
    uniform float u_noise; 
    uniform float u_time;

    uniform float u_effectPulsation;
    uniform float u_effectRipple;
    uniform float u_effectDisplacement;
    
    varying vec2 vUv;
    varying vec3 vPosition;

    // Fonction d'aléatoire basique pour le glitch
    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
        vUv = uv;
        
        // 1. Lecture des cartes de profondeur et Mixage
        float d1 = texture2D(u_depth1, uv).r; 
        float d2 = texture2D(u_depth2, uv).r; 
        float d3 = texture2D(u_depth3, uv).r;
        float finalDepth = (d1 * u_weight1) + (d2 * u_weight2) + (d3 * u_weight3);
        
        vec3 basePosition = position;
        basePosition.z += finalDepth * u_zMultiplier;

        // --- 2. PREPARATION DES 3 ETATS GEOMETRIQUES SELON LA PISTE ---

        // ETAT 1 : INSTRU (Ondulation fluide)
        vec3 pos1 = basePosition;
        float wave = sin(basePosition.x * 2.0 + u_time) * cos(basePosition.y * 2.0 + u_time);
        pos1.z += wave * (u_noise * 0.4);

        // ETAT 2 : SANS VOIX (Torsion et dispersion)
        vec3 pos2 = basePosition;
        float dist = length(basePosition.xy);
        float angle = dist * (u_noise * 0.15);
        mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
        pos2.xy *= rot;
        pos2.x += sin(basePosition.y * 10.0 + u_time) * (u_noise * 0.05);

        // ETAT 3 : SANS MELODIE (Glitch et quantification)
        vec3 pos3 = basePosition;
        if (u_noise > 0.1) {
            float q = 15.0 - (u_noise * 2.0); 
            q = max(q, 2.0); 
            pos3 = floor(basePosition * q) / q;
            if (rand(basePosition.xy + u_time * 0.1) > 0.95) {
                pos3.z += u_noise * 0.3;
            }
        }

        // --- 3. MIXAGE DES PISTES ---
        vec3 trackPosition = (pos1 * u_weight1) + (pos2 * u_weight2) + (pos3 * u_weight3);

        // --- 4. AJOUT DES EFFETS STRUCTURELS GLOBAUX ---
        vec3 transformed = trackPosition;

        if (u_effectPulsation > 0.5) {
            float pulse = sin(u_time * 3.0) * 0.05 * u_noise;
            transformed.xyz *= (1.0 + pulse);
        }
        if (u_effectRipple > 0.5) {
            float distFromCenter = length(transformed.xy);
            float ripple = sin(distFromCenter * 10.0 - u_time * 5.0) * 0.1 * u_noise;
            transformed.z += ripple;
        }
        if (u_effectDisplacement > 0.5) {
            transformed.x += sin(transformed.y * 20.0 + u_time) * 0.02 * u_noise;
            transformed.z += cos(transformed.x * 20.0 + u_time) * 0.02 * u_noise;
        }

        // --- 5. ENVOI AU RENDU ---
        vPosition = transformed; // Transmission au fragment shader
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        gl_PointSize = u_pointSize; 
    }
`;

const fragmentShader = `
    uniform sampler2D u_albedo;
    uniform float u_weight1;
    uniform float u_weight2;
    uniform float u_weight3;
    uniform float u_time;
    uniform float u_noise;

    varying vec2 vUv;
    varying vec3 vPosition;

    // Fonction de bruit pour le noise fade
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vec4 finalColor = vec4(0.0);

        // --- PISTE 1 : INSTRU (Rendu non modifié) ---
        if (u_weight1 > 0.01) {
            vec4 color1 = texture2D(u_albedo, vUv);
            finalColor += color1 * u_weight1;
        }

        // --- PISTE 2 : SANS VOIX (CRT + RGB Shift) ---
        if (u_weight2 > 0.01) {
            float shift = 0.01 * u_noise;
            float r = texture2D(u_albedo, vUv + vec2(shift, 0.0)).r;
            float g = texture2D(u_albedo, vUv).g;
            float b = texture2D(u_albedo, vUv - vec2(shift, 0.0)).b;
            vec4 color2 = vec4(r, g, b, 1.0);

            float scanline = sin(vUv.y * 800.0 + u_time * 10.0) * 0.1 * u_noise;
            color2.rgb -= scanline;

            finalColor += color2 * u_weight2;
        }

        // --- PISTE 3 : SANS MÉLODIE (Depth Color + Noise Fade) ---
        if (u_weight3 > 0.01) {
            float depthNormalized = (vPosition.z + 1.0) / 5.0; 
            vec3 closeColor = vec3(1.0, 0.2, 0.2); 
            vec3 farColor = vec3(0.1, 0.1, 0.4);  
            vec3 depthColor = mix(farColor, closeColor, clamp(depthNormalized, 0.0, 1.0));

            float noiseThreshold = u_noise * 0.15; 
            if (random(vUv) < noiseThreshold) {
                discard; 
            }

            finalColor += vec4(depthColor, 1.0) * u_weight3;
        }

        gl_FragColor = finalColor;
    }
`;

const geometry = new THREE.PlaneGeometry(PARAMS.planeWidth, PARAMS.planeHeight, PARAMS.widthSegments, PARAMS.heightSegments);

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_albedo: { value: albedoTexture }, 
        u_depth1: { value: depth1 }, 
        u_depth2: { value: depth2 }, 
        u_depth3: { value: depth3 },
        u_weight1: { value: 1.0 }, 
        u_weight2: { value: 0.0 }, 
        u_weight3: { value: 0.0 },
        u_effectPulsation: { value: 0.0 },
        u_effectRipple: { value: 0.0 },
        u_effectDisplacement: { value: 0.0 },
        u_zMultiplier: { value: 5.0 }, 
        u_pointSize: { value: 0.1}, 
        u_noise: { value: 0.0 }, 
        u_time: { value: 0.0 }
    },
    vertexShader: vertexShader, 
    fragmentShader: fragmentShader, 
    transparent: true
});

scene.add(new THREE.Points(geometry, material));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; 
controls.dampingFactor = 0.05; 
controls.autoRotate = true; 
controls.autoRotateSpeed = 0.5; 
controls.maxPolarAngle = Math.PI / 1.5;

// Force la caméra à pivoter autour du centre du relief (Z=2.5) au lieu de l'origine plane
controls.target.set(0, 0, 2.5);
const targetWeights = { w1: 1.0, w2: 0.0, w3: 0.0 };
const audio = document.getElementById('remix-audio');

const tracks = {
    1: `${trackPath}audio_instru.mp3`,
    2: `${trackPath}audio_sans_voix.mp3`,
    3: `${trackPath}audio_sans_melodie.mp3`
};

window.playTrack = function(trackId) {
    audio.pause(); 
    audio.src = tracks[trackId]; 
    audio.currentTime = 0; 
    audio.play();
    
    document.querySelectorAll('.remix-btn').forEach(btn => btn.classList.remove('active-btn'));
    document.getElementById(`btn-track${trackId}`).classList.add('active-btn');
    
    targetWeights.w1 = trackId === 1 ? 1.0 : 0.0;
    targetWeights.w2 = trackId === 2 ? 1.0 : 0.0;
    targetWeights.w3 = trackId === 3 ? 1.0 : 0.0;
};

// Écouteurs pour les sliders
document.getElementById('point-size').addEventListener('input', (e) => material.uniforms.u_pointSize.value = parseFloat(e.target.value));
document.getElementById('noise-intensity').addEventListener('input', (e) => material.uniforms.u_noise.value = parseFloat(e.target.value));
document.getElementById('extrusion-force').addEventListener('input', (e) => material.uniforms.u_zMultiplier.value = parseFloat(e.target.value));
// Écouteurs pour les cases à cocher (Effets structurels)
document.getElementById('effect-pulsation').addEventListener('change', (e) => {
    material.uniforms.u_effectPulsation.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('effect-ripple').addEventListener('change', (e) => {
    material.uniforms.u_effectRipple.value = e.target.checked ? 1.0 : 0.0;
});

document.getElementById('effect-displacement').addEventListener('change', (e) => {
    material.uniforms.u_effectDisplacement.value = e.target.checked ? 1.0 : 0.0;
});
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix(); 
    renderer.setSize(container.clientWidth, container.clientHeight);
});

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    
   // Lerp (interpolation fluide) pour les poids
    material.uniforms.u_weight1.value += (targetWeights.w1 - material.uniforms.u_weight1.value) * 0.05;
    material.uniforms.u_weight2.value += (targetWeights.w2 - material.uniforms.u_weight2.value) * 0.05;
    material.uniforms.u_weight3.value += (targetWeights.w3 - material.uniforms.u_weight3.value) * 0.05;
    
    material.uniforms.u_time.value = clock.getElapsedTime();
    
    controls.update(); 
    renderer.render(scene, camera);
}
animate();