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

    void main() {
        vUv = uv;
        float depthValue = texture2D(u_depth, uv).r;
        vec3 newPosition = position;

    
        newPosition.z += depthValue * u_zMultiplier;

        vec2 diff = newPosition.xy - u_mouse.xy;
        float distMouse = length(diff); 
        
 
        float radius = 5.0; 
        float influence = 1.0 - smoothstep(10.0, radius, distMouse); 

        if (influence > 0.0) {
         
            float waveAxis = diff.x * 0.9 + diff.y * 0.1; 
            
           
            float distFromCenter = length(newPosition.xy);
            
       
            float extremeFactor = 1.0 + pow(distFromCenter * 0.25, 2.0); 

       
            float wave = sin(waveAxis * 15.0 - u_time * 20.0);

         
            newPosition.z += wave * influence * extremeFactor * 0.8;
            newPosition.y += (wave * 0.4) * influence * extremeFactor; 
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

let audioCtx, track, distortion;
let isAudioInitialized = false;
let currentDistortion = 0; // Valeur de distorsion en cours


function makeDistortionCurve(amount, n_samples = 8192) {
    const k = amount;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
     
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

window.addEventListener('click', () => {
    if (!isAudioInitialized && audio) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        track = audioCtx.createMediaElementSource(audio);
        
   
        distortion = audioCtx.createWaveShaper();
        distortion.curve = makeDistortionCurve(0); 
        distortion.oversample = '4x'; 
      
        track.connect(distortion).connect(audioCtx.destination);
        
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
   
        const distFromCenter = Math.min(Math.sqrt(mouse.x * mouse.x + mouse.y * mouse.y), 1.0);
        
  
        const targetDistortion = Math.pow(distFromCenter, 5) * 1000;
        
  
        currentDistortion += (targetDistortion - currentDistortion) * 0.1;
        
  
        distortion.curve = makeDistortionCurve(currentDistortion);
    }
    controls.update(); 
    renderer.render(scene, camera);
}
animate();