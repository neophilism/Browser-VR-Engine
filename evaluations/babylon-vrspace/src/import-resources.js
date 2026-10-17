// ImportMeshAsync registers partial resources with the scene, unlike the blocked
// collection used by LoadAssetContainerAsync. That lets failure cleanup own every
// new scene resource even when the loader never returns a completed container.
export const resourceCollections = Object.freeze([
  'animationGroups','meshes','transformNodes','skeletons','materials','multiMaterials',
  'textures','geometries','morphTargetManagers','cameras','lights','particleSystems',
  'spriteManagers','reflectionProbes','actionManagers',
]);
export const captureResources = scene => Object.fromEntries(resourceCollections.map(key=>[key,new Set(scene[key]||[])]));
export const newResources = (scene,before) => Object.fromEntries(resourceCollections.map(key=>[key,(scene[key]||[]).filter(value=>!before[key].has(value))]));
export const resourceCounts = scene => Object.fromEntries(resourceCollections.map(key=>[key,(scene[key]||[]).length]));
export function disposeResources(resources) {
  const failures=[];
  for(const key of resourceCollections) for(const resource of resources[key]||[]) {
    try {resource.dispose();} catch(error) {failures.push(`${key}: ${error.message}`);}
  }
  if(failures.length)throw new AggregateError(failures.map(message=>new Error(message)),'Import resource rollback failed');
}
