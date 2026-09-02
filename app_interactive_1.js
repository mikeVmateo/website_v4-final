import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const PARAMS = {
    zMultiplier: 5.0,        
    widthSegments: 512,      
    heightSegments: 1024,    
    planeWidth: 10,          
    planeHeight: 14.1        
};

const trackPath = window.CURRENT_TRACK_PATH || '';
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 0, 15); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
container.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const albedoTexture = textureLoader.load(`${trackPath}albedo.jpg`);
const depthTexture = textureLoader.load(`${trackPath}depth.png`);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-1000, -1000);


const invisiblePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshBasicMaterial({ visible: false })
);
scene.add(invisiblePlane);


window.addEventListener('mousemove', (event) => {
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

const vertexShader = /* glsl */`
    uniform sampler2D u_depth;
    uniform float u_zMultiplier;
    uniform vec3 u_mouse;
    uniform float u_time;

    varying vec2 vUv;

    // Fonction de bruit
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vUv = uv;
        float depthValue = texture2D(u_depth, uv).r;
        vec3 newPosition = position;

        // Relief de base avec la depth map
        newPosition.z += depthValue * u_zMultiplier;

        // --- EFFET ÉCLATEMENT ---
        vec2 diff = newPosition.xy - u_mouse.xy;
        float dist = length(diff); 
        
       
        float radius = 100.0; 

       
        float influence = 1.0 - smoothstep(10.1, radius, dist); 

        if (influence > 0.0) {
            // Direction de répulsion brute
            vec2 repulseDir = diff / (dist + 0.0001);

            // 1. Onde de choc saccadée
            float shockwave = tan(dist * 1.0 - u_time * 1.0);
            
            // 2. Génération d'une valeur aléatoire unique pour chaque point
            float chaos = random(newPosition.xy) * 0.5 - 1.0; // Donne une valeur entre -2.0 et -2.0

            // 3. Éclatement XY 
            newPosition.x += (repulseDir.x + chaos * 1.0) * influence * shockwave * 1.0;
            newPosition.y += (repulseDir.y - chaos * 1.0) * influence * shockwave * 1.0;
            
            // 4. Éclatement Z : Les points "explosent" vers la caméra (comme des débris)
            newPosition.z += influence * (shockwave * 6.0 + chaos * 1.0); 
        }

        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        gl_PointSize = 2.0; 
    }
`;
const fragmentShader = `
    uniform sampler2D u_albedo;
    varying vec2 vUv;
    void main() {
        gl_FragColor = texture2D(u_albedo, vUv);
    }
`;

const geometry = new THREE.PlaneGeometry(PARAMS.planeWidth, PARAMS.planeHeight, PARAMS.widthSegments, PARAMS.heightSegments);
const clock = new THREE.Clock(); 

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_albedo: { value: albedoTexture },
        u_depth: { value: depthTexture },
        u_zMultiplier: { value: PARAMS.zMultiplier },
   
        u_mouse: { value: new THREE.Vector3(0, 0, 0) }, 
        u_time: { value: 0.0 } 
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true
});


scene.add(new THREE.Points(geometry, material));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05; 
controls.autoRotate = true; controls.autoRotateSpeed = 1.0;
controls.minDistance = 5; controls.maxDistance = 30; controls.maxPolarAngle = Math.PI / 1.5; 

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});


const targetMousePos = new THREE.Vector3(0, 0, 0);

const audio = document.getElementById('bg-audio') || document.getElementById('remix-audio');

let audioCtx, track, filter;
let isAudioInitialized = false;


window.addEventListener('click', () => {
    if (!isAudioInitialized && audio) {
      
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
      
        track = audioCtx.createMediaElementSource(audio);
        
  
        filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 22000; 
        
      
        track.connect(filter).connect(audioCtx.destination);
        
     
        audio.preservesPitch = false;
        
        isAudioInitialized = true;
    }
}, { once: true }); 
function animate() {
    requestAnimationFrame(animate);
    

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(invisiblePlane);
    
    if (intersects.length > 0) {
      
        targetMousePos.copy(intersects[0].point);
    } else {
       
        targetMousePos.set(-100, -100, 0); 
    }
    
   
    material.uniforms.u_mouse.value.lerp(targetMousePos, 0.1);
    
  
    material.uniforms.u_time.value = clock.getElapsedTime();

    if (isAudioInitialized && !audio.paused) {
        
     
        const targetSpeed = 1.0 + (mouse.x * 0.5);
        audio.playbackRate += (targetSpeed - audio.playbackRate) * 0.1; 

     
        const distFromCenterY = Math.abs(mouse.y);
        const targetFreq = 22000 - (distFromCenterY * 21200); 
        filter.frequency.value += (targetFreq - filter.frequency.value) * 0.1;

        // 3. VOLUME (Optionnel : on baisse légèrement sur les bords)
        const distFromCenter = Math.min(Math.sqrt(mouse.x * mouse.x + mouse.y * mouse.y), 1.0);
        const targetVolume = 1.0 - (distFromCenter * 0.4); 
        audio.volume += (targetVolume - audio.volume) * 0.1;
    }
    controls.update(); 
    renderer.render(scene, camera);
    
}
animate();