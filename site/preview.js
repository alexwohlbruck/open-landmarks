import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {createModelView} from '../rendering/model-view.js';

export async function preview(container, spec) {
  const disposeModel=model=>model.traverse(o=>{
    o.geometry?.dispose();
    for(const material of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])material.dispose();
  });
  const specs=[spec,...(spec.companions||[])];
  const results=await Promise.allSettled(specs.map(async item=>{
    const response=await fetch('DecompressionStream' in window ? item.gzip : item.url);
    if(!response.ok)throw Error('Model unavailable');
    const bytes=await ('DecompressionStream' in window
      ? new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : response.arrayBuffer());
    const {scene}=await new GLTFLoader().parseAsync(bytes,'');
    if(item.offset)scene.position.fromArray(item.offset);
    return scene;
  }));
  if(results.some(r=>r.status==='rejected')){
    for(const result of results)if(result.status==='fulfilled')disposeModel(result.value);
    throw results.find(r=>r.status==='rejected').reason;
  }
  const model=new THREE.Group();
  for(const result of results)model.add(result.value);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (error) { disposeModel(model); throw error; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', `Interactive 3D model of ${spec.name}. Drag to orbit, scroll to zoom.`);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.tabIndex = 0;
  const view=createModelView(model,renderer,{direction:spec.direction});
  const {camera,center,size}=view;
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(center);
  controls.minDistance = size * .65; controls.maxDistance = size * 5; controls.enablePan = false;
  const draw = () => view.render();
  const resize = () => { const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); };
  const lightSelect = document.querySelector('#light');
  const lighting = () => {
    const night = lightSelect.value === 'night';
    container.classList.toggle('night', night);
    view.setPreset(night?'night':'day');draw();
  };
  controls.addEventListener('change', draw); lightSelect.addEventListener('change', lighting);
  container.querySelector('img')?.remove(); container.prepend(renderer.domElement);
  controls.update(); resize(); lighting();
  const observer = new ResizeObserver(resize); observer.observe(container);
  window.addEventListener('pagehide', () => {
    observer.disconnect(); controls.dispose(); view.dispose();renderer.dispose(); lightSelect.removeEventListener('change', lighting);
    disposeModel(model);
  }, { once: true });
}
