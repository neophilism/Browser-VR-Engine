import catalog from '@bve-evaluation/media-catalog';

// Rendered media is limited to the frozen evaluation originals. Unused opaque
// payloads remain preservable; this is not a general media-upload safety parser.
export function requireFrozenMedia(asset) {
  const kind=asset?.mediaType?.split('/')[0];
  if(!asset||!['audio','video','image'].includes(kind)||asset.reference.kind!==kind||
      !catalog.some(record=>record.mediaType===asset.mediaType&&record.sha256===asset.reference.revision&&record.sizeBytes===asset.bytes.length)){
    throw new Error('Portable world: rendered media must match the exact frozen catalog kind, MIME, hash and length');
  }
}
