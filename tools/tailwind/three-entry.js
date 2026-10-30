// Tailwind's three.js (r186): only what tailwind/world3d.js and tailwind/finish.js use. Built by build.sh into
// tailwind/assets/three-r186.min.js, the same file name and version the fleet's other 3D games carry.
export {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Fog, Color, HemisphereLight, DirectionalLight,
  Mesh, Group, Object3D, InstancedMesh, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, PlaneGeometry,
  LatheGeometry, IcosahedronGeometry, ConeGeometry, CircleGeometry, ShapeGeometry, Shape, Quaternion, Matrix4, BufferGeometry, BufferAttribute, Float32BufferAttribute,
  MeshStandardMaterial, MeshPhysicalMaterial, MeshBasicMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace,
  Vector2, Vector3, Box3, MathUtils, NeutralToneMapping, DoubleSide, PMREMGenerator, PCFShadowMap,
  WebGLRenderTarget, HalfFloatType, DepthTexture,
} from 'three';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
// Hummingham's finishing pass (tailwind/finish.js): soft contact shadow, a colour grade, tone mapping.
export { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
export { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
export { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
export { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
