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
const depthTexture = textureLoader.load(`${trackPath}depth.jpg`);

const vertexShader = `
    uniform sampler2D u_depth;
    uniform float u_zMultiplier;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        float depthValue = texture2D(u_depth, uv).r;
        vec3 newPosition = position;
        newPosition.z += depthValue * u_zMultiplier;
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
const material = new THREE.ShaderMaterial({
    uniforms: {
        u_albedo: { value: albedoTexture },
        u_depth: { value: depthTexture },
        u_zMultiplier: { value: PARAMS.zMultiplier }
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

function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    renderer.render(scene, camera);
}
animate();